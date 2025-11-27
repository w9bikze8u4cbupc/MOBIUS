import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";

const BACKEND_URL = "http://localhost:5001";

export function ImagesStep({ projectId, components = [], images = [], componentImages = {}, onImagesUpdated }) {
  const [loading, setLoading] = useState(false);
  const [bggUrl, setBggUrl] = useState("");
  const [pdfPath, setPdfPath] = useState("");
  const [manualFile, setManualFile] = useState(null);
  const [localImages, setLocalImages] = useState(images);
  const [localLinks, setLocalLinks] = useState(componentImages || {});
  const [cropDraft, setCropDraft] = useState({ x: 0, y: 0, w: 100, h: 100, purpose: "component" });
  const [tagDraft, setTagDraft] = useState("");

  useEffect(() => {
    setLocalImages(images || []);
  }, [images]);

  useEffect(() => {
    setLocalLinks(componentImages || {});
  }, [componentImages]);

  useEffect(() => {
    if (!projectId) return;
    const load = async () => {
      try {
        const res = await axios.get(`${BACKEND_URL}/api/projects/${projectId}/images`);
        onImagesUpdated?.(res.data || {});
      } catch (err) {
        console.error("Failed to load images", err);
      }
    };
    load();
  }, [projectId, onImagesUpdated]);

  const groupedImages = useMemo(() => {
    return (localImages || []).reduce((acc, img) => {
      const bucket = img.source || "unknown";
      acc[bucket] = acc[bucket] || [];
      acc[bucket].push(img);
      return acc;
    }, {});
  }, [localImages]);

  const refreshState = (payload) => {
    setLocalImages(payload.images || []);
    setLocalLinks(payload.componentImages || {});
    onImagesUpdated?.(payload);
  };

  const handleFetchBgg = async () => {
    if (!projectId || !bggUrl) return;
    setLoading(true);
    try {
      const res = await axios.post(`${BACKEND_URL}/api/projects/${projectId}/images/fetch-bgg`, { bggUrl });
      refreshState(res.data || {});
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleExtractRulebook = async () => {
    if (!projectId || !pdfPath) return;
    setLoading(true);
    try {
      const res = await axios.post(`${BACKEND_URL}/api/projects/${projectId}/images/extract-rulebook`, { pdfPath });
      refreshState(res.data || {});
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleManualUpload = async () => {
    if (!projectId || !manualFile) return;
    setLoading(true);
    try {
      const form = new FormData();
      form.append("file", manualFile);
      const res = await axios.post(`${BACKEND_URL}/api/projects/${projectId}/images/manual`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      refreshState(res.data || {});
      setManualFile(null);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleExtractor = async (url) => {
    if (!projectId || !url) return;
    setLoading(true);
    try {
      const res = await axios.post(`${BACKEND_URL}/api/projects/${projectId}/images/image-extractor`, { url });
      refreshState(res.data || {});
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCropSave = async (image) => {
    if (!projectId || !image?.id) return;
    const crops = [...(image.crops || []), { ...cropDraft, id: `${image.id}-crop-${Date.now()}` }];
    try {
      const res = await axios.patch(
        `${BACKEND_URL}/api/projects/${projectId}/images/${image.id}`,
        { crops, tags: image.tags }
      );
      refreshState(res.data || {});
    } catch (err) {
      console.error(err);
    }
  };

  const handleTagSave = async (image) => {
    if (!projectId || !image?.id) return;
    const tags = Array.from(new Set([...(image.tags || []), ...(tagDraft ? tagDraft.split(",").map((t) => t.trim()) : [])])).filter(Boolean);
    try {
      const res = await axios.patch(
        `${BACKEND_URL}/api/projects/${projectId}/images/${image.id}`,
        { tags, crops: image.crops }
      );
      refreshState(res.data || {});
      setTagDraft("");
    } catch (err) {
      console.error(err);
    }
  };

  const handleComponentLink = async (componentId, imageId) => {
    if (!projectId || !componentId) return;
    const next = new Set(localLinks[componentId] || []);
    if (next.has(imageId)) {
      next.delete(imageId);
    } else {
      next.add(imageId);
    }
    try {
      const res = await axios.post(`${BACKEND_URL}/api/projects/${projectId}/components/${componentId}/images`, {
        imageIds: Array.from(next),
      });
      refreshState(res.data || {});
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="pipeline-section">
      <h3>Images</h3>
      <p className="pipeline-muted">
        Fetch BGG assets, extract rulebook pages, upload manual photos, and link them to components. Use simple crops and tags
        to prepare assets for later storyboard mapping.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
        <div className="card">
          <h4>BGG</h4>
          <input
            type="text"
            placeholder="BGG URL or ID"
            value={bggUrl}
            onChange={(e) => setBggUrl(e.target.value)}
            style={{ width: "100%" }}
          />
          <button onClick={handleFetchBgg} disabled={loading || !bggUrl} style={{ marginTop: 8 }}>
            Fetch BGG images
          </button>
        </div>

        <div className="card">
          <h4>Rulebook</h4>
          <input
            type="text"
            placeholder="Rulebook PDF path"
            value={pdfPath}
            onChange={(e) => setPdfPath(e.target.value)}
            style={{ width: "100%" }}
          />
          <button onClick={handleExtractRulebook} disabled={loading || !pdfPath} style={{ marginTop: 8 }}>
            Extract rulebook images
          </button>
        </div>

        <div className="card">
          <h4>Manual upload</h4>
          <input type="file" onChange={(e) => setManualFile(e.target.files?.[0] || null)} />
          <button onClick={handleManualUpload} disabled={loading || !manualFile} style={{ marginTop: 8 }}>
            Add manual image
          </button>
        </div>

        <div className="card">
          <h4>ImageExtractor</h4>
          <input
            type="text"
            placeholder="https://..."
            onBlur={(e) => handleExtractor(e.target.value)}
            style={{ width: "100%" }}
          />
          <p className="pipeline-muted" style={{ marginTop: 6 }}>
            Paste a URL and tab out to trigger extraction.
          </p>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        {Object.entries(groupedImages).map(([source, imgs]) => (
          <div key={source} style={{ marginBottom: 16 }}>
            <h4 style={{ textTransform: "capitalize" }}>{source} ({imgs.length})</h4>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
              {imgs.map((img) => (
                <div key={img.id} style={{ border: "1px solid #ddd", borderRadius: 6, padding: 8 }}>
                  <div style={{ fontSize: 12, color: "#555" }}>ID: {img.id}</div>
                  <div style={{ fontSize: 12, color: "#777", marginBottom: 6 }}>Tags: {(img.tags || []).join(", ") || "—"}</div>
                  <button onClick={() => handleCropSave(img)} style={{ width: "100%", marginBottom: 6 }}>
                    Add crop
                  </button>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 4 }}>
                    <label> x <input type="number" value={cropDraft.x} onChange={(e) => setCropDraft((c) => ({ ...c, x: Number(e.target.value) }))} /></label>
                    <label> y <input type="number" value={cropDraft.y} onChange={(e) => setCropDraft((c) => ({ ...c, y: Number(e.target.value) }))} /></label>
                    <label> w <input type="number" value={cropDraft.w} onChange={(e) => setCropDraft((c) => ({ ...c, w: Number(e.target.value) }))} /></label>
                    <label> h <input type="number" value={cropDraft.h} onChange={(e) => setCropDraft((c) => ({ ...c, h: Number(e.target.value) }))} /></label>
                  </div>
                  <div style={{ marginTop: 6 }}>
                    <input
                      type="text"
                      placeholder="Add tags (comma separated)"
                      value={tagDraft}
                      onChange={(e) => setTagDraft(e.target.value)}
                      style={{ width: "100%" }}
                    />
                    <button onClick={() => handleTagSave(img)} style={{ width: "100%", marginTop: 4 }}>
                      Save tags
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 24 }}>
        <h4>Component links</h4>
        {components.length === 0 && <p className="pipeline-muted">No components detected yet.</p>}
        {components.map((component) => (
          <div key={component.id || component.name} style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 600 }}>{component.name || component.id}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {localImages.map((img) => {
                const isLinked = (localLinks[component.id] || []).includes(img.id);
                return (
                  <button
                    key={img.id}
                    onClick={() => handleComponentLink(component.id, img.id)}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 6,
                      border: isLinked ? "2px solid #0070f3" : "1px solid #ccc",
                      background: isLinked ? "#e6f0ff" : "#f9f9f9",
                    }}
                  >
                    {img.source}: {img.id}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
