# CloudPix – Application Screenshots

This directory is designated for storing actual screenshots of your running CloudPix instance.

> **Note on Screenshots**: In accordance with project integrity standards, no fake or synthetic screenshots claiming AWS S3 connection are pre-packaged. Once you launch the platform on your machine or EC2 instance, take screenshots of your active application and place them here.

---

### Suggested Screenshots to Capture:
1. `dashboard-local-demo.png`: The dashboard running in Local Demo Mode showing the lilac badge and drag-and-drop zone.
2. `dashboard-s3-connected.png`: The dashboard running with AWS S3 connected, displaying presigned URL indicators.
3. `preview-modal.png`: The high-resolution preview modal with the metadata drawer open.
4. `mobile-responsive.png`: The mobile layout view of the gallery and navbar.

---

### UI Component Architecture Blueprint

```
+--------------------------------------------------------------------------+
|  [Logo] CloudPix   Home  Features  Dashboard  Architecture  [● Demo] [Upload]|
+--------------------------------------------------------------------------+
|                                                                          |
|       Your Images, Your Cloud.                       [ Cloud Engine ]    |
|       Modern S3 Storage & Presigned URLs              [ Illustration ]   |
|       [Go to Dashboard]  [How It Works]                                  |
|                                                                          |
+--------------------------------------------------------------------------+
|  [●] Storage Engine: Local Demo Mode (or AWS S3 Bucket: bucket-name)    |
+--------------------------------------------------------------------------+
|  Total Images: 12  | Storage: 14.2 MB | Active: Local Demo | Window: 60m |
+--------------------------------------------------------------------------+
|  +--------------------------------------------------------------------+  |
|  |                 [ Cloud Upload Dropzone ]                          |  |
|  |             Drag & drop your images here or browse                 |  |
|  |               JPG, PNG, WEBP (Max 5 MB)                            |  |
|  +--------------------------------------------------------------------+  |
+--------------------------------------------------------------------------+
|  [Search...]  [All][PNG][JPG][WEBP]  Sort: [Newest v]  [Grid][List] [↻]  |
+--------------------------------------------------------------------------+
|  +--------------+  +--------------+  +--------------+  +--------------+  |
|  | [Thumbnail]  |  | [Thumbnail]  |  | [Thumbnail]  |  | [Thumbnail]  |  |
|  | PNG  Local   |  | WEBP Local   |  | JPG  Local   |  | PNG  Local   |  |
|  | photo_01.png |  | banner.webp  |  | avatar.jpg   |  | chart.png    |  |
|  | 2.1 MB • 2m  |  | 840 KB • 10m |  | 1.4 MB • 1h  |  | 350 KB • 1d  |  |
|  +--------------+  +--------------+  +--------------+  +--------------+  |
+--------------------------------------------------------------------------+
```

