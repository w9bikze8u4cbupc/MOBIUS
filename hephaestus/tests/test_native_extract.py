from native_extract import iter_unique_image_refs


class FakePage:
    def __init__(self, xrefs):
        self.xrefs = xrefs

    def get_images(self, full=True):
        return [(xref,) for xref in self.xrefs]


class FakeDocument:
    def __init__(self, pages):
        self.pages = pages
        self.page_count = len(pages)

    def load_page(self, index):
        return self.pages[index]


def test_reused_xref_is_extracted_once_with_first_page_provenance():
    document = FakeDocument([
        FakePage([11, 3967]),
        FakePage([3967, 22]),
        FakePage([11, 33]),
    ])

    assert list(iter_unique_image_refs(document)) == [
        (0, 0, 11),
        (0, 1, 3967),
        (1, 1, 22),
        (2, 1, 33),
    ]
