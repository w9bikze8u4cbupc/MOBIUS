import importlib.util
import hashlib
from pathlib import Path
import tempfile
import unittest
import fitz

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('region', ROOT / 'scripts/render-rulebook-pages-hdpi.py')
region = importlib.util.module_from_spec(spec)
spec.loader.exec_module(region)

class SourcePageRegionTests(unittest.TestCase):
    def test_region_reassembles_pdf_placement_without_inventing_raster_detail(self):
        with tempfile.TemporaryDirectory() as directory:
            pdf, output = Path(directory) / 'source.pdf', Path(directory) / 'region.png'
            document = fitz.open()
            page = document.new_page(width=200, height=200)
            image = str(ROOT / 'tests/fixtures/images/test-bg-100x100.png')
            page.insert_image(fitz.Rect(0, 0, 100, 100), filename=image)
            page.insert_image(fitz.Rect(100, 0, 200, 100), filename=image)
            document.save(pdf)
            document.close()
            request = {'pdf':str(pdf),'sourceSha256':hashlib.sha256(pdf.read_bytes()).hexdigest(),
                'page':1,'bbox':[0,0,1,.5],'dpi':300,'output':str(output)}
            first = region.render_region(request)
            self.assertEqual(len(first['nativeRasterContributors']), 2)
            self.assertEqual(first['effectiveSourceWidth'], 200)
            self.assertGreater(first['width'], 200)
            self.assertTrue(first['requiresPixelVerification'])
            self.assertEqual(first, region.render_region(request))
            cluster = region.render_region({**request,'mode':'native-cluster','output':str(Path(directory)/'cluster.png')})
            self.assertEqual(cluster['method'], 'pymupdf-native-raster-cluster')
            self.assertEqual(len(cluster['nativeRasterContributors']), 2)
            self.assertEqual(cluster['width'], 200)
            self.assertTrue(cluster['requiresPixelVerification'])
            with self.assertRaises(ValueError): region.render_region({**request,'sourceSha256':'0'*64})
            with self.assertRaises(ValueError): region.render_region({**request,'page':0})

if __name__ == '__main__': unittest.main()
