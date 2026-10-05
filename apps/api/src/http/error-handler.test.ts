import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { after, before, describe, it } from "node:test";
import express from "express";
import pg from "pg";
import { z } from "zod";
import { createApp } from "../app.js";
import { AppError, ConflictError, InvalidInputError, NotFoundError } from "../errors.js";
import { errorHandler, notFoundHandler } from "./error-handler.js";
import { idParam, parse } from "./validate.js";

function databaseError(code: string, constraint?: string): pg.DatabaseError {
  const error = new pg.DatabaseError("mensaje interno de PostgreSQL", 0, "error");
  error.code = code;
  error.constraint = constraint;
  return error;
}

// Levanta la app en un puerto libre (el 0 deja que el sistema elija uno).
async function listen(app: express.Express): Promise<{ server: Server; baseUrl: string }> {
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  return { server, baseUrl: `http://localhost:${(server.address() as AddressInfo).port}` };
}

describe("middleware de errores", () => {
  let server: Server;
  let baseUrl: string;

  before(async () => {
    const app = express();
    app.use(express.json());
    app.get("/validation", () => {
      parse(z.object({ name: z.string().min(1), level: z.number() }), { name: "" });
    });
    app.get("/not-found", () => {
      throw new NotFoundError("Esquema 7 no encontrado");
    });
    app.get("/conflict", () => {
      throw new ConflictError("El esquema está publicado");
    });
    app.get("/invalid", () => {
      throw new InvalidInputError("Código inválido", { reason: "Guion entre dígitos" });
    });
    app.get("/async", async () => {
      await Promise.resolve();
      throw new NotFoundError("Lanzado en una función async");
    });
    app.get("/pg-known", () => {
      throw databaseError("23505", "schemes_single_active");
    });
    app.get("/pg-unknown-constraint", () => {
      throw databaseError("23514", "otra_restriccion");
    });
    app.get("/pg-other", () => {
      throw databaseError("42P01");
    });
    app.get("/app-error", () => {
      throw new AppError("Error genérico sin tipo");
    });
    app.get("/boom", () => {
      throw new Error("SELECT secreto FROM tabla_interna");
    });
    app.use(notFoundHandler);
    app.use(errorHandler);
    ({ server, baseUrl } = await listen(app));
  });

  after(() => server.close());

  async function get(path: string): Promise<[number, any]> {
    const response = await fetch(baseUrl + path);
    return [response.status, await response.json()];
  }

  it("ValidationError: 400 con un detalle por campo, en español", async () => {
    const [status, body] = await get("/validation");
    assert.equal(status, 400);
    assert.equal(body.error, "Datos inválidos");
    assert.deepEqual(
      body.details.map((issue: { path: string }) => issue.path),
      ["name", "level"],
    );
    assert.match(body.details[0].message, /caracteres/);
  });

  it("NotFoundError: 404", async () => {
    assert.deepEqual(await get("/not-found"), [404, { error: "Esquema 7 no encontrado" }]);
  });

  it("ConflictError: 409", async () => {
    assert.deepEqual(await get("/conflict"), [409, { error: "El esquema está publicado" }]);
  });

  it("InvalidInputError: 422 con detalles", async () => {
    assert.deepEqual(await get("/invalid"), [
      422,
      { error: "Código inválido", details: { reason: "Guion entre dígitos" } },
    ]);
  });

  it("errores lanzados en manejadores async (Express 5)", async () => {
    assert.equal((await get("/async"))[0], 404);
  });

  it("restricción conocida de PostgreSQL: mensaje propio y nombre de la restricción", async () => {
    assert.deepEqual(await get("/pg-known"), [
      409,
      { error: "Ya hay otro esquema activo", constraint: "schemes_single_active" },
    ]);
  });

  it("restricción desconocida: mensaje genérico", async () => {
    const [status, body] = await get("/pg-unknown-constraint");
    assert.equal(status, 422);
    assert.equal(body.constraint, "otra_restriccion");
  });

  it("otros errores de PostgreSQL, AppError sin tipo y errores inesperados: 500 sin detalles", async (t) => {
    const log = t.mock.method(console, "error", () => {});
    for (const path of ["/pg-other", "/app-error", "/boom"]) {
      const [status, body] = await get(path);
      assert.equal(status, 500, path);
      assert.deepEqual(body, { error: "Error interno del servidor" }, path);
    }
    assert.equal(log.mock.callCount(), 3, "los 500 se registran en el log");
  });

  it("ruta inexistente: 404", async () => {
    assert.deepEqual(await get("/no-existe"), [404, { error: "Ruta no encontrada" }]);
  });
});

describe("la app real", () => {
  let server: Server;
  let baseUrl: string;

  before(async () => {
    ({ server, baseUrl } = await listen(createApp()));
  });

  after(() => server.close());

  it("responde 400 en español a un JSON mal formado", async () => {
    const response = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"identifier": ',
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "El cuerpo de la petición no es JSON válido" });
  });

  it("responde 404 en JSON a una ruta inexistente", async () => {
    const response = await fetch(`${baseUrl}/schemes/no-existe`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "Ruta no encontrada" });
  });
});

describe("idParam", () => {
  it("acepta enteros positivos escritos como texto", () => {
    assert.equal(parse(idParam, "42"), 42);
  });

  for (const value of ["abc", "1.5", "0", "-3", "", "2147483648"]) {
    it(`rechaza ${JSON.stringify(value)}`, () => {
      assert.throws(() => parse(idParam, value), { name: "ValidationError" });
    });
  }
});

