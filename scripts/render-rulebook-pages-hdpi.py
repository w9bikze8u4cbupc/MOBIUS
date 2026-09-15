#!/usr/bin/env python3
"""Render selected rulebook pages at high DPI without altering source assets."""

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import fitz


def render_region(request):
    """Source-coordinate region, not an enlargement of an extracted fragment."""
    pdf = Path(request['pdf']).resolve()
    if hashlib.sha256(pdf.read_bytes()).hexdigest() != request['sourceSha256']:
        raise ValueError('Source PDF SHA mismatch')
    page_number = request['page']
    bounds = request['bbox']
    if (type(page_number) is not int or not isinstance(bounds, list) or len(bounds) != 4
            or not all(isinstance(n, (int, float)) and math.isfinite(n) for n in bounds)
            or not (0 <= bounds[0] < bounds[2] <= 1 and 0 <= bounds[1] < bounds[3] <= 1)):
        raise ValueError('Invalid one-based page/normalized region')
    dpi = int(request.get('dpi', 300))
    if not 72 <= dpi <= 600:
        raise ValueError('Bounded page raster DPI required')
    with fitz.open(pdf) as document:
        if not 1 <= page_number <= document.page_count:
            raise ValueError('Source page missing')
        page = document[page_number - 1]
        rect = page.rect
        clip = fitz.Rect(bounds[0]*rect.width, bounds[1]*rect.height, bounds[2]*rect.width, bounds[3]*rect.height)
        native = []
        for image in page.get_image_info(xrefs=True):
            box = fitz.Rect(image['bbox'])
            if box.intersects(clip) and box.width > 0 and box.height > 0:
                native.append({'xref':image['xref'],'width':image['width'],'height':image['height'],
                    'pdfBounds':list(box), 'transform':list(image['transform']),
                    'pixelsPerPoint':min(image['width']/box.width,image['height']/box.height)})
        # Page raster DPI does not magically increase embedded raster detail.
        density = min([dpi/72] + [r['pixelsPerPoint'] for r in native])
        method = 'pymupdf-source-region-raster'
        if request.get('mode') == 'native-cluster':
            # Search hypothesis: adjacent similarly sampled raster tiles mostly
            # inside the measured object region. Keep original order/positions;
            # do not fill missing pixels or infer component identity.
            tiles = [r for r in native if (fitz.Rect(r['pdfBounds']) & clip).get_area() / fitz.Rect(r['pdfBounds']).get_area() >= .7]
            if not tiles:
                raise ValueError('No source raster cluster within measured region')
            seed = max(tiles, key=lambda r: (fitz.Rect(r['pdfBounds']) & clip).get_area())
            connected = [seed]
            while True:
                additions = [r for r in tiles if r not in connected
                    and abs(r['pixelsPerPoint']/seed['pixelsPerPoint']-1) < .05
                    and any((fitz.Rect(r['pdfBounds']) + (-1,-1,1,1)).intersects(fitz.Rect(t['pdfBounds'])) for t in connected)]
                if not additions: break
                connected.extend(additions)
            tiles = [r for r in native if r in connected]
            if any(abs(r['transform'][1]) > .001 or abs(r['transform'][2]) > .001
                    or r['transform'][0] <= 0 or r['transform'][3] <= 0 for r in tiles):
                raise ValueError('Rotated/sheared source cluster requires source-page rendering')
            cluster = fitz.Rect(tiles[0]['pdfBounds'])
            for tile in tiles[1:]: cluster |= fitz.Rect(tile['pdfBounds'])
            canvas = fitz.open()
            target = canvas.new_page(width=cluster.width, height=cluster.height)
            for tile in tiles:
                pixmap = fitz.Pixmap(document, tile['xref'])
                smask = document.extract_image(tile['xref']).get('smask',0)
                if smask: pixmap = fitz.Pixmap(pixmap, fitz.Pixmap(document,smask))
                box = fitz.Rect(tile['pdfBounds']) - (cluster.x0,cluster.y0,cluster.x0,cluster.y0)
                target.insert_image(box, pixmap=pixmap, keep_proportion=False)
            density = min(r['pixelsPerPoint'] for r in tiles)
            pix = target.get_pixmap(matrix=fitz.Matrix(density,density),alpha=True)
            canvas.close()
            native, clip = tiles, cluster
            method = 'pymupdf-native-raster-cluster'
        else:
            pix = page.get_pixmap(dpi=dpi, clip=clip, alpha=False)
        output = Path(request['output']).resolve()
        output.parent.mkdir(parents=True, exist_ok=True)
        content = pix.tobytes('png')
        if output.exists() and output.read_bytes() != content:
            raise ValueError('Region replay pixel mismatch')
        if not output.exists():
            temporary = output.with_suffix('.tmp')
            temporary.write_bytes(content)
            temporary.replace(output)
        return {'path':str(output),'sourcePdfSha256':request['sourceSha256'],'sourcePage':page_number,
            'pdfBounds':list(clip),'normalizedBounds':bounds,'dpi':dpi,'nativeRasterContributors':native,
            'width':pix.width,'height':pix.height,'sha256':hashlib.sha256(content).hexdigest(),
            'effectiveSourceWidth':math.floor(clip.width*density),'effectiveSourceHeight':math.floor(clip.height*density),
            'method':method,'requiresPixelVerification':True}


def main() -> None:
    if sys.argv[1:] == ['--region-json']:
        print(json.dumps(render_region(json.load(sys.stdin))))
        return
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--pages", required=True, help="Comma-separated one-based pages")
    parser.add_argument("--dpi", type=int, default=360)
    args = parser.parse_args()

    pdf_path = Path(args.pdf).resolve()
    output_dir = Path(args.out).resolve()
    pages = sorted({int(value.strip()) for value in args.pages.split(",") if value.strip()})
    output_dir.mkdir(parents=True, exist_ok=True)

    document = fitz.open(pdf_path)
    for page_number in pages:
        if page_number < 1 or page_number > document.page_count:
            raise ValueError(f"Page {page_number} outside 1..{document.page_count}")
        pixmap = document[page_number - 1].get_pixmap(dpi=args.dpi, alpha=False)
        pixmap.save(output_dir / f"page-{page_number:02d}-{args.dpi}dpi.png")

    print(output_dir)


if __name__ == "__main__":
    main()
