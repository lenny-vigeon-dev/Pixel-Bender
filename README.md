# Local Image Enhancer

<p align="center">
  <img src="https://img.shields.io/badge/Status-Development-green" alt="Status" />
  <img src="https://img.shields.io/badge/Privacy-100%25-blue" alt="Privacy" />
</p>

## Goal

I created this project because I am annoyed by the proliferation of AI services that require server-side processing and subscription payments. While I understand that large models require significant compute, I believe there is a need for free, privacy-focused solutions that run entirely on the consumer's device.

This project uses **ONNX Runtime Web** to run a Super Resolution model directly in your browser. No images are ever uploaded to a server. Your privacy is respected, and you can use this tool offline once loaded.

This is a first attempt to prove that high-quality upscaling is possible client-side with optimized models.

## Features

- **Local Inference**: Runs entirely in the browser using WebAssembly or WebGL.
- **Privacy First**: No server uploads.
- **Tiling Support**: Handles large images by splitting them into chunks (to support models with fixed input sizes).
- **Live Progress**: Watch the upscaling process in real-time.
- **Comparison**: Compare the original and upscaled results with a slider.
- **Multilingual**: Supports English, French, Spanish, German, and Korean.
- **Theming**: Dark and Light mode support.

## Project Structure

This is a **React + TypeScript + Vite** project styled with **Tailwind CSS**.

- `src/services/upscaler.ts`: Contains the ONNX runtime logic and tiling algorithm (ported from PyTorch).
- `src/components/features/image-processor`: Main UI components for the upload and processing flow.
- `public/`: Contains the ONNX model files (`generator_latest.onnx`) and WASM binaries.

## How to Run

### Prerequisites

- Node.js (v18+)
- pnpm (recommended) or npm

### Installation

1.  Clone the repository.
2.  Install dependencies:

```bash
pnpm install
# or
npm install
```

3.  Ensure the model file (`generator_latest.onnx`) is present in the `public/` directory.

### Development

Start the development server:

```bash
pnpm dev
# or
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Build

To build for production:

```bash
pnpm build
```

## Credits

Built with ❤️ by [Your Name].
Powered by ONNX Runtime.

Frontend project that aims to provide AI models for image enhancement that runs locally on the user device.
