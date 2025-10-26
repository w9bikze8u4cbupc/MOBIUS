# Containerized Rendering

This document explains how to use the containerized version of the Mobius Tutorial Generator rendering pipeline.

## Docker Image

The Docker image includes:
- Node.js 18 LTS
- FFmpeg with H.264 support
- Required fonts for subtitle rendering
- All necessary dependencies

## Building the Image

To build the Docker image locally:

```bash
docker build -t mobius-renderer .
```

## Running Renders in Containers

### Basic Usage

To run a render job in a container:

```bash
docker run --rm \
  -v /path/to/assets:/app/assets \
  -v /path/to/output:/app/out \
  mobius-renderer \
  node scripts/render.js --project-id my-project --mode preview
```

### Preview Render Example

```bash
docker run --rm \
  -v $(pwd)/assets:/app/assets \
  -v $(pwd)/out:/app/out \
  mobius-renderer \
  node scripts/render.js --project-id test --mode preview --preview-seconds 5
```

### Full Render Example

```bash
docker run --rm \
  -v $(pwd)/assets:/app/assets \
  -v $(pwd)/out:/app/out \
  mobius-renderer \
  node scripts/render.js --project-id test
```

## Volume Mounts

The container expects two volume mounts:

1. `/app/assets` - Input assets (images, audio files, etc.)
2. `/app/out` - Output directory for rendered videos

## Environment Variables

The container supports several environment variables for configuration:

- `RENDER_TIMEOUT_MS` - Timeout for render operations (default: 300000)
- `RENDER_THUMBNAIL_AT_SEC` - Time in seconds for thumbnail capture (default: 3)

## Resource Constraints

To limit resource usage:

```bash
docker run --rm \
  -v /path/to/assets:/app/assets \
  -v /path/to/output:/app/out \
  --memory=4g \
  --cpus=2 \
  mobius-renderer \
  node scripts/render.js --project-id my-project --mode preview
```

## Security Considerations

- The container runs as a non-root user
- No privileged capabilities are required
- All input files should be validated before mounting
- Output files are written to the mounted volume only

## Troubleshooting

### No Space Left on Device

Ensure the output volume has sufficient space for the rendered video.

### Font Issues

The container includes several font packages. If you encounter font-related errors, you can add additional fonts by extending the Dockerfile.

### Permission Issues

Ensure the mounted volumes have appropriate read/write permissions for the container user.