# Genera el PDF del informe (informe.html) en dos pasadas: imprime con Edge,
# busca en qué página quedó cada sección y completa el índice con esos números.
# Requiere Windows con Microsoft Edge y el paquete pymupdf.
# Uso: python generar.py informe.html Informe-alojamiento.pdf
import re
import subprocess
import sys
from pathlib import Path

import pymupdf

EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
work = Path(__file__).parent / "_tmp"
work.mkdir(exist_ok=True)
src, out = Path(sys.argv[1]), Path(sys.argv[2])


def imprimir(html: Path, pdf: Path) -> None:
    subprocess.run(
        [EDGE, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
         f"--user-data-dir={work / 'edge-profile'}", f"--print-to-pdf={pdf}", html.resolve().as_uri()],
        check=True, capture_output=True,
    )


html = src.read_text(encoding="utf-8")
titulos = dict(re.findall(r'<h2 id="([^"]+)"[^>]*>([^<]+)</h2>', html))

borrador_html = src.with_name("_borrador.html")
borrador_html.write_text(html, encoding="utf-8")
borrador_pdf = work / "_borrador.pdf"
imprimir(borrador_html, borrador_pdf)

doc = pymupdf.open(borrador_pdf)
paginas = {}
for ref, titulo in titulos.items():
    for i in range(2, doc.page_count):  # después de la portada y el índice
        if doc[i].search_for(titulo.strip()):
            paginas[ref] = i + 1
            break
doc.close()
faltan = set(titulos) - set(paginas)
if faltan:
    sys.exit(f"No se encontraron en el PDF: {faltan}")

def numerar(m: re.Match) -> str:
    return f'{m.group(1)}<span class="n">{paginas[m.group(2)]}</span>'

final = re.sub(r'(<li data-ref="([^"]+)">.*?)<span class="n"></span>', numerar, html)
borrador_html.write_text(final, encoding="utf-8")
imprimir(borrador_html, out)
borrador_html.unlink()

doc = pymupdf.open(out)
print(f"{out} · {doc.page_count} páginas · índice: {paginas}")
