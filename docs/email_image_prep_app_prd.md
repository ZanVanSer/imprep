# Email Image Prep App — Product & Development Doc
name imprep
## 1) Overview

Build a simple one-page React app for preparing images for email marketing. The app should let a user drop one or many images, choose an optimization preset or custom settings, click **Prepare**, and receive email-ready outputs optimized for common email best practices.

Primary goal: turn raw images into **inbox-ready assets** with the least possible manual work.

This is **not** a general image editor. It is a focused workflow tool for:
- resizing for email layouts
- choosing a sensible output format
- compressing intelligently
- stripping metadata
- preserving quality where it matters
- producing assets that fit common email constraints

---

## 2) Product goals

### Core goals
- Make image preparation for email fast and repeatable.
- Support batch processing.
- Keep UX simple enough for non-technical marketers.
- Bake in email-specific defaults so users do not need to understand compression details.

### Non-goals for v1
- No full image editing suite.
- No crop/rotate/filter tools.
- No cloud storage integration.
- No AI-generated alt text in v1.
- No direct email-platform integrations in v1.

---

## 3) Target user

A solo marketer, email marketer, founder, or designer who wants to quickly prepare images for newsletters and campaigns.

Typical problems:
- images are too large in dimensions
- images are too heavy in KB/MB
- screenshots become blurry after compression
- users forget retina sizing
- users do not know whether to choose JPEG or PNG

---

## 4) Main user flow

1. User opens app.
2. User drags and drops one image or multiple images.
3. User chooses a preset:
   - Hero
   - Content / Full-width
   - Half-width
   - Logo
   - Screenshot / Text-heavy
   - Custom
4. User optionally changes advanced settings.
5. User clicks **Prepare**.
6. App uploads images to the server and processes them with `sharp`.
7. User sees:
   - original vs optimized preview
   - original size and final size
   - dimensions before and after
   - format before and after
   - status/recommendation
8. User downloads each file or all files as ZIP.

---

## 5) Recommended UX structure

### Single-page layout

#### A. Header
- App name
- one-line description: “Prepare images for email campaigns using email-safe defaults.”

#### B. Upload area
- drag-and-drop box
- button: **Select images**
- support multi-file upload
- accepted formats: JPG, JPEG, PNG, WebP, GIF

#### C. Settings panel

##### Preset selector
Use radio cards or segmented controls:
- Hero
- Content
- Half-width
- Logo
- Screenshot
- Custom

##### Output format
- Auto
- JPEG
- PNG
- WebP (experimental / optional)

##### Retina
- On
- Off

##### Max display width
- hidden unless Custom selected
- numeric input in px

##### Compression mode
- Balanced
- Smaller file
- Sharper image

##### Batch naming
- Keep original filename
- Add suffix
  - example suffix default: `-email`

#### D. Action area
- button: **Prepare**
- disabled until at least one file is uploaded

#### E. Results area
For each image:
- thumbnail preview
- original filename
- preset used
- original dimensions / final dimensions
- original file size / final file size
- output format
- reduction percentage
- badges like:
  - Email-ready
  - Large but acceptable
  - Too heavy
- button: **Download**

Top of results list:
- button: **Download all as ZIP**
- button: **Clear all**

---

## 6) Presets and default logic

### Hero
Use for banners and top email visuals.
- display width: 600px
- export width with retina ON: 1200px
- preferred format: JPEG for photos, PNG for text-heavy graphics
- target file size: ideally 120–300 KB

### Content / Full-width
Use for regular full-width content blocks.
- display width: 600px
- export width with retina ON: 1200px
- target file size: ideally 80–200 KB

### Half-width
Use for two-column layouts.
- display width: 300px
- export width with retina ON: 600px
- target file size: ideally 40–120 KB

### Logo
Use for logos and simple graphics.
- display width: 100–200px
- export width with retina ON: 200–400px
- preferred format: PNG
- target file size: ideally under 50 KB

### Screenshot / Text-heavy
Use for app screenshots, dashboards, UI, or graphics with text.
- display width: 600px
- export width with retina ON: 1200px
- preferred format: PNG by default
- if JPEG is forced, use higher quality to protect text edges
- target file size: ideally 80–250 KB

### Custom
User can set:
- display width
- retina on/off
- output format
- compression mode

---

## 7) Output format rules

### Auto mode logic
The app should choose format automatically:

- **JPEG** for photos, gradients, and complex imagery without transparency
- **PNG** for logos, screenshots, graphics with sharp text, and images with transparency
- **GIF** input should remain GIF only if animation must be preserved; otherwise warn that GIF optimization is limited in v1
- **WebP** should be optional and marked as experimental because email client support is mixed; do not make it the default output for v1

### Suggested detection heuristics
Auto mode can use simple practical rules:
- if input has transparency → PNG
- if preset is Logo → PNG
- if preset is Screenshot → PNG
- if image has many sharp edges / flat-color areas / text-like structure → PNG preferred
- otherwise → JPEG

For v1, a preset-based rule is enough. Advanced image-content classification can wait.

---

## 8) Resizing rules

The app should think in two widths:
- **display width**: intended width inside email
- **export width**: actual output file width

If retina is ON:
- export width = display width × 2

If retina is OFF:
- export width = display width

Never upscale smaller images by default.
If an uploaded image is already smaller than target export width:
- keep original dimensions
- show warning badge: `Smaller than recommended for retina`

Preserve aspect ratio always.

---

## 9) Compression rules

### JPEG
Quality targets by mode:
- Smaller file: 60–68
- Balanced: 72–78
- Sharper image: 82–88

Use progressive JPEG when supported by chosen library.
Strip metadata.
Convert to sRGB if possible.

### PNG
Use lossless optimization.
Apply palette reduction when safe.
Strip metadata.
Do not over-process logos/text in ways that create visible artifacts.

### WebP
Only when user explicitly chooses it.
Show subtle UI note: “Not recommended as the default email output because support varies by client.”

---

## 10) Metadata and color handling

Always:
- strip EXIF metadata
- strip unnecessary ICC/profile metadata when safe
- preserve orientation correctly
- normalize to sRGB where possible

This helps reduce file size and avoid rendering surprises.

---

## 11) Recommended settings to add beyond your initial idea

These are worth including in v1 because they add real value without making the app complicated.

### A. Compression mode
Reason: most users do not want a raw quality slider.

Options:
- Smaller file
- Balanced
- Sharper image

### B. Download all as ZIP
Reason: multi-image upload is much more useful with batch download.

### C. Filename suffix
Reason: helps keep exports organized.
Example:
- `hero.png` → `hero-email.png`

### D. Preserve transparency toggle
Relevant when PNG input could otherwise become JPEG in Auto mode.
Default: ON

### E. Warning / quality badges
Reason: this is one of the biggest product differentiators.
Examples:
- Too large for typical email use
- Smaller than retina recommendation
- Good for email
- Use PNG for sharper text

### F. “Use case note” under presets
Reason: reduces mistakes.
Example:
- Hero: “For main banner images at top of email.”
- Screenshot: “Best for UI captures and graphics with text.”

---

## 12) Validation and recommendations engine

After processing, each result should be evaluated.

### Suggested result statuses
- **Email-ready**
- **Acceptable**
- **Needs review**

### Example rules
- file size under target range → Email-ready
- file size slightly above target but under 500 KB → Acceptable
- file size above 500 KB → Needs review
- image smaller than recommended for selected preset with retina ON → Needs review
- JPEG chosen for screenshot preset → Acceptable with note

### Example recommendation messages
- “Looks good for a full-width email block.”
- “This image is sharp, but still heavier than ideal for email.”
- “PNG preserved text quality, but file size stayed relatively high.”
- “Image is smaller than recommended for retina displays.”

---

## 13) Tech stack recommendation

### Frontend
- Next.js
- TypeScript
- Tailwind CSS

### Why this stack
- easy Vercel deployment
- simple one-page app
- good file handling in browser
- clean component structure

### Image processing approach for v1
Use **server-side processing with `sharp`**.
Benefits:
- more reliable resizing and format conversion
- stronger metadata stripping and orientation handling
- better PNG and JPEG output consistency
- safer batch processing for larger uploads

### Candidate libraries
- `sharp` for resizing, compression, and format conversion
- `jszip` for download-all ZIP generation

### Important limitation
This version uploads user images to the server for processing, so hosting must support the `sharp` pipeline and short-lived file handling.

### Privacy note
Processed files are transient and should not be stored as a long-term library in v1.

---

## 14) Recommended architecture

### Components
- `UploadDropzone`
- `PresetSelector`
- `FormatSelector`
- `AdvancedSettings`
- `ActionBar`
- `ResultsList`
- `ResultCard`
- `TopSummaryBar`

### Main state
- uploaded files
- selected preset
- advanced settings
- processing state
- processed results
- warnings/errors

### Core processing pipeline
For each file:
1. Read file
2. Detect image metadata
   - width
   - height
   - mime type
   - transparency if possible
3. Resolve preset settings
4. Resolve final display width and export width
5. Resize while preserving aspect ratio
6. Resolve output format
7. Compress/export using chosen mode
8. Strip metadata as much as possible
9. Generate output blob + preview URL
10. Evaluate result and create status/recommendation

---

## 15) Suggested TypeScript domain model

```ts
export type Preset =
  | 'hero'
  | 'content'
  | 'half'
  | 'logo'
  | 'screenshot'
  | 'custom';

export type OutputFormat = 'auto' | 'jpeg' | 'png' | 'webp';

export type CompressionMode = 'small' | 'balanced' | 'sharp';

export interface AppSettings {
  preset: Preset;
  outputFormat: OutputFormat;
  retina: boolean;
  customDisplayWidth?: number;
  compressionMode: CompressionMode;
  preserveTransparency: boolean;
  fileSuffix: string;
}

export interface UploadedImage {
  id: string;
  file: File;
  name: string;
  originalWidth: number;
  originalHeight: number;
  mimeType: string;
  sizeBytes: number;
  hasTransparency?: boolean;
}

export interface ProcessedImageResult {
  id: string;
  originalName: string;
  outputName: string;
  preset: Preset;
  originalWidth: number;
  originalHeight: number;
  finalWidth: number;
  finalHeight: number;
  originalSizeBytes: number;
  finalSizeBytes: number;
  originalMimeType: string;
  finalMimeType: string;
  reductionPercent: number;
  status: 'email-ready' | 'acceptable' | 'needs-review';
  recommendation: string;
  previewUrl: string;
  blob: Blob;
}
```

---

## 16) Functional requirements

### Upload
- support drag-and-drop
- support multiple file selection
- accept JPG, JPEG, PNG, WebP, GIF
- show validation errors for unsupported files

### Processing
- process one or many files
- preserve aspect ratio
- resize to target export width
- support preset and custom width
- support auto format resolution
- strip metadata where possible
- support compression mode selection

### Output
- preview processed result
- show size reduction and dimensions
- download individual files
- download all files as ZIP

### UX
- processing indicator
- clear empty state
- good mobile layout, but desktop-first is fine
- settings should apply to all uploaded files in v1

---

## 17) Non-functional requirements

- fast enough for common marketing assets
- should handle at least 10–20 typical images in one batch on a normal desktop
- no backend required for v1 if browser-only approach is used
- privacy-friendly: user files should not leave browser in v1

---

## 18) Error handling

Show user-friendly messages for:
- unsupported file type
- corrupted image
- processing failed
- browser memory issues on very large images
- ZIP generation failed

Examples:
- “This file type is not supported.”
- “This image could not be processed.”
- “This image is very large and may fail in browser-only mode.”

---

## 19) UI copy suggestions

### Header
**Email Image Prep**
Prepare images for email campaigns with email-safe defaults.

### Upload box
Drop images here or click to browse
Supports JPG, PNG, WebP, GIF

### Button
**Prepare**

### Results labels
- Original
- Optimized
- Reduction
- Format
- Dimensions
- Status

### Empty state
Upload one or more images to prepare them for email.

---

## 20) MVP definition

### MVP includes
- one-page UI
- multi-upload
- presets
- custom width
- auto format selection
- retina toggle
- compression mode
- processing in browser
- result cards
- individual download
- ZIP download
- metadata stripping where possible
- recommendation/status badges

### MVP excludes
- crop tools
- side-by-side zoom comparison
- AI suggestions
- per-image custom settings
- email HTML snippet generation
- direct ESP integration

---

## 21) Nice-to-have features after MVP

### v1.1
- per-image preset override
- before/after zoom compare
- estimated email suitability score
- remember last-used settings in localStorage

### v1.2
- export CSV summary of files
- generate suggested alt text field input
- “Do not upscale” toggle
- dark mode

### v2
- optional server-side `sharp` pipeline
- stronger PNG optimization
- generate HTML `<img>` snippet with suggested width and alt placeholder
- direct export package for email builders

---

## 22) Build notes for the coding agent

### Product direction to protect
Keep the interface simple.
Do not turn this into a generic image editor.
Favor smart defaults over too many sliders.

### Important implementation choices
- do not upscale images by default
- preserve aspect ratio always
- batch process sequentially or with limited concurrency to avoid browser crashes
- keep settings global for all files in MVP
- make WebP optional, not default
- bias toward PNG for logos and screenshots
- bias toward JPEG for photos

### Performance notes
- create object URLs carefully and revoke them when no longer needed
- process batches with a queue to reduce memory pressure
- cap very large dimensions if needed and warn user

---

## 23) Acceptance criteria

The app is successful when:
- a user can upload multiple images
- choose a preset and click Prepare
- receive optimized files that are smaller and email-appropriate
- download each result or all results in a ZIP
- understand from the UI whether each image is suitable for common email usage

---

## 24) Suggested initial backlog

### Phase 1
- scaffold Next.js app with Tailwind and TypeScript
- create page layout
- build upload dropzone
- parse image metadata

### Phase 2
- implement preset settings engine
- implement resize/export pipeline
- implement auto format decision rules
- implement compression modes

### Phase 3
- build results cards
- build download actions
- build ZIP export
- add validation and recommendation engine

### Phase 4
- polish UX
- localStorage for last settings
- test with sample marketing images

---

## 25) Final recommendation

Your original idea is good and already close to MVP.
The main additions worth including are:
- compression mode instead of raw quality slider
- preserve transparency toggle
- ZIP export
- result status/recommendation badges
- filename suffix option

That gives you a simple but clearly differentiated app: not just “compress image,” but “prepare image for email marketing.”
