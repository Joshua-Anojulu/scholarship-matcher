import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


class TestLegalPages:
    def test_privacy_is_served(self, client):
        response = client.get("/privacy")
        assert response.status_code == 200
        assert "text/html" in response.headers["content-type"]
        # Key disclosures must be present.
        assert "Anthropic" in response.text
        assert "13" in response.text

    def test_terms_is_served(self, client):
        response = client.get("/terms")
        assert response.status_code == 200
        assert "text/html" in response.headers["content-type"]
        assert "sponsor" in response.text.lower()


class TestProductionHygiene:
    def test_security_headers_on_index(self, client):
        response = client.get("/")
        assert response.headers.get("X-Content-Type-Options") == "nosniff"
        assert response.headers.get("X-Frame-Options") == "DENY"
        assert response.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"
        assert "Content-Security-Policy" in response.headers

    def test_robots_txt_lists_sitemap(self, client):
        response = client.get("/robots.txt")
        assert response.status_code == 200
        assert "User-agent: *" in response.text
        assert "Sitemap:" in response.text
        assert response.text.endswith("\n")

    def test_sitemap_xml_includes_public_pages(self, client):
        response = client.get("/sitemap.xml")
        assert response.status_code == 200
        assert "application/xml" in response.headers["content-type"]
        assert "<loc>http://testserver/</loc>" in response.text
        assert "<loc>http://testserver/privacy</loc>" in response.text
        assert "<loc>http://testserver/terms</loc>" in response.text

    def test_index_uses_absolute_og_image_url(self, client):
        response = client.get("/")
        assert response.status_code == 200
        assert 'property="og:image" content="http://testserver/static/og-image-dark.svg"' in response.text
        assert 'name="twitter:image" content="http://testserver/static/og-image-dark.svg"' in response.text

    def test_public_pages_include_production_canonical_urls(self, client):
        index = client.get("/")
        privacy = client.get("/privacy")
        terms = client.get("/terms")

        assert 'property="og:url" content="https://scholarships4u.dev/"' in index.text
        assert 'rel="canonical" href="https://scholarships4u.dev/"' in index.text
        assert 'rel="canonical" href="https://scholarships4u.dev/privacy"' in privacy.text
        assert 'rel="canonical" href="https://scholarships4u.dev/terms"' in terms.text

    def test_openapi_available_in_development(self, client):
        response = client.get("/openapi.json")
        assert response.status_code == 200
