import argparse
import sys
import os
import math
from pathlib import Path
import torch
import numpy as np
from PIL import Image
from torchvision import transforms

# Ensure we can import from src
sys.path.append(str(Path(__file__).parent))

from src.train_model.model import Generator

def process_chunked(model, tensor, device, tile_size, overlap, scale_factor=2):
    """
    Splits the input tensor into chunks, processes them, and reassembles.
    Handles overlap blending with gradient weighting for smooth transitions.
    """
    _, h, w = tensor.shape

    # Initialize output canvas
    out_h = h * scale_factor
    out_w = w * scale_factor
    output = torch.zeros((3, out_h, out_w), device=device)
    output_weights = torch.zeros((3, out_h, out_w), device=device)

    stride = tile_size - overlap

    h_steps = math.ceil(h / stride) if stride > 0 else 1
    w_steps = math.ceil(w / stride) if stride > 0 else 1

    # If the image is smaller than tile_size, just handle it as one step (h_steps calculation handles this roughly, but safety check)
    if h <= tile_size: h_steps = 1
    if w <= tile_size: w_steps = 1

    processed_coords = set()

    for i in range(h_steps):
        for j in range(w_steps):
            # Calculate coordinates ensuring fixed tile_size input if possible
            y_start = i * stride
            x_start = j * stride

            # Adjust starts if they would push over edge, provided image is big enough
            if y_start + tile_size > h and h >= tile_size:
                y_start = h - tile_size

            if x_start + tile_size > w and w >= tile_size:
                x_start = w - tile_size

            # Check for redundancy
            if (y_start, x_start) in processed_coords:
                continue
            processed_coords.add((y_start, x_start))

            y_end = min(y_start + tile_size, h)
            x_end = min(x_start + tile_size, w)

            # Extract patch
            patch = tensor[:, y_start:y_end, x_start:x_end].unsqueeze(0).to(device)

            # Handle padding if image is smaller than tile_size
            pad_h = tile_size - patch.shape[2]
            pad_w = tile_size - patch.shape[3]

            if pad_h > 0 or pad_w > 0:
                patch = torch.nn.functional.pad(patch, (0, pad_w, 0, pad_h), mode='reflect')

            # Inference
            with torch.no_grad():
                out_patch = model(patch).squeeze(0)

            # If we padded, we must crop the output
            if pad_h > 0 or pad_w > 0:
                valid_h = (y_end - y_start) * scale_factor
                valid_w = (x_end - x_start) * scale_factor
                out_patch = out_patch[:, :valid_h, :valid_w]

            # Calculate output coordinates
            out_y_start = y_start * scale_factor
            out_x_start = x_start * scale_factor

            out_h_patch = out_patch.shape[1]
            out_w_patch = out_patch.shape[2]

            out_y_end = out_y_start + out_h_patch
            out_x_end = out_x_start + out_w_patch

            # Create gradient weight mask for this patch
            weight_mask = create_gradient_mask(
                out_h_patch,
                out_w_patch,
                overlap * scale_factor,
                device
            )

            # Apply weight mask and accumulate
            weighted_patch = out_patch * weight_mask
            output[:, out_y_start:out_y_end, out_x_start:out_x_end] += weighted_patch
            output_weights[:, out_y_start:out_y_end, out_x_start:out_x_end] += weight_mask


    # Normalize by weights (weighted average for overlaps)
    # Avoid div by zero
    output_weights[output_weights == 0] = 1
    output = output / output_weights

    return output


def create_gradient_mask(height, width, overlap_size, device):
    """
    Creates a gradient weight mask for blending overlapping tiles.
    Weight transitions from 0 at edges to 1 in the center over the overlap distance.

    Args:
        height: Height of the tile
        width: Width of the tile
        overlap_size: Size of the overlap region in pixels
        device: Torch device

    Returns:
        Tensor of shape (1, height, width) with gradient weights
    """
    if overlap_size <= 0:
        return torch.ones((1, height, width), device=device)

    # Create 1D gradients for vertical and horizontal directions
    # Gradient goes from 0 at edge to 1 at overlap_size distance from edge

    # Vertical gradient (top and bottom edges)
    v_gradient = torch.ones(height, device=device)
    if height > overlap_size:
        # Top edge gradient (0 to 1)
        v_gradient[:overlap_size] = torch.linspace(0, 1, overlap_size, device=device)
        # Bottom edge gradient (1 to 0)
        v_gradient[-overlap_size:] = torch.linspace(1, 0, overlap_size, device=device)
    else:
        # If tile is smaller than overlap, use full gradient
        v_gradient = torch.linspace(0.5, 0.5, height, device=device)

    # Horizontal gradient (left and right edges)
    h_gradient = torch.ones(width, device=device)
    if width > overlap_size:
        # Left edge gradient (0 to 1)
        h_gradient[:overlap_size] = torch.linspace(0, 1, overlap_size, device=device)
        # Right edge gradient (1 to 0)
        h_gradient[-overlap_size:] = torch.linspace(1, 0, overlap_size, device=device)
    else:
        # If tile is smaller than overlap, use full gradient
        h_gradient = torch.linspace(0.5, 0.5, width, device=device)

    # Combine vertical and horizontal gradients (multiply to get 2D mask)
    # This creates a mask where corners have the lowest weights
    mask_2d = v_gradient.unsqueeze(1) * h_gradient.unsqueeze(0)

    # Add channel dimension
    mask = mask_2d.unsqueeze(0)  # Shape: (1, height, width)

    # Broadcast to 3 channels
    mask = mask.repeat(3, 1, 1)  # Shape: (3, height, width)

    return mask

def main():
    parser = argparse.ArgumentParser(description="Upscale image using GAN Super-Resolution")
    parser.add_argument("-m", "--model", type=str, required=True, help="Path to model .pth file")
    parser.add_argument("-i", "--image", type=str, required=True, help="Path to input image")
    parser.add_argument("-d", "--device", type=str, default=None, help="Device (cpu, cuda)")
    parser.add_argument("-o", "--overlap", type=int, default=32, help="Overlap in pixels")
    parser.add_argument("-s", "--scale", type=float, default=2.0, help="Final output scale factor")
    parser.add_argument("-ss", "--super_scale", type=float, default=None, help="Internal upscale factor for anti-aliasing (defaults to scale)")

    args = parser.parse_args()

    # Constants
    TILE_SIZE = 512 # Model input size for chunking
    # Determine device
    if args.device is None:
        device_name = "cuda" if torch.cuda.is_available() else "cpu"
    else:
        if args.device == "cuda" and not torch.cuda.is_available():
            print("Warning: CUDA requested but not available, falling back to CPU.")
            device_name = "cpu"
        else:
            device_name = args.device

    device = torch.device(device_name)
    print(f"Using device: {device}")

    # Load Model structure
    # Note: We assume standard configuration used in training (3 in, 3 out)
    model = Generator(in_channels=3, out_channels=3).to(device)

    if not os.path.exists(args.model):
        print(f"Error: Model file not found at {args.model}")
        sys.exit(1)

    try:
        print(f"Loading weights from {args.model}...")
        state_dict = torch.load(args.model, map_location=device)
        model.load_state_dict(state_dict)
    except Exception as e:
        print(f"Error loading model weights: {e}")
        sys.exit(1)

    model.eval()

    # Load Image
    if not os.path.exists(args.image):
        print(f"Error: Image file not found at {args.image}")
        sys.exit(1)

    try:
        img = Image.open(args.image).convert("RGB")
    except Exception as e:
        print(f"Error loading image: {e}")
        sys.exit(1)

    print(f"Original Image Size: {img.size} (WxH)")

    # Preprocess
    # Same normalization as training
    transform = transforms.Compose([
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.5, 0.5, 0.5], std=[0.5, 0.5, 0.5])
    ])

    img_tensor = transform(img) # C, H, W

    # Determine resizing parameters
    target_scale = args.scale
    internal_scale = args.super_scale if args.super_scale is not None else target_scale
    if internal_scale < target_scale:
        internal_scale = target_scale

    current_scale = 1.0

    # Recursive Upscaling Loop
    while current_scale < internal_scale:
        print(f"Upscaling from x{current_scale} to x{current_scale * 2}...")

        # Determine if chunking is needed based on CURRENT tensor size
        c, h, w = img_tensor.shape
        use_chunking = False
        if h > TILE_SIZE or w > TILE_SIZE:
            use_chunking = True

        if use_chunking:
            print(f"  Image chunking enabled (Size: {w}x{h})...")
            try:
                img_tensor = process_chunked(model, img_tensor, device, TILE_SIZE, args.overlap)
            except RuntimeError as e:
                 if "out of memory" in str(e):
                     print("Error: Out of memory during chunk processing.")
                     sys.exit(1)
                 else:
                     raise e
        else:
            print("  Processing full image...")
            with torch.no_grad():
                # Add batch dimension. If tensor is on CPU, move to device.
                model_input = img_tensor.unsqueeze(0).to(device)
                img_tensor = model(model_input).squeeze(0)

        current_scale *= 2.0

    # Downscale if needed (Anti-Aliasing step)
    if current_scale != target_scale:
        print(f"Downscaling/Resizing from x{current_scale} to x{target_scale}...")
        orig_w, orig_h = img.size
        final_h = int(orig_h * target_scale)
        final_w = int(orig_w * target_scale)

        # Ensure tensor is float32 for interpolation
        img_tensor = img_tensor.float()

        img_tensor = torch.nn.functional.interpolate(
            img_tensor.unsqueeze(0),
            size=(final_h, final_w),
            mode='bicubic',
            align_corners=False,
            antialias=True
        ).squeeze(0)

    # Denormalize: [-1, 1] -> [0, 1]
    out_tensor = (img_tensor * 0.5 + 0.5).clamp(0, 1)

    # Prepare output path
    img_path_obj = Path(args.image)
    out_filename = img_path_obj.stem + "_upscaled" + img_path_obj.suffix
    out_path = img_path_obj.parent / out_filename

    # Save
    out_img = transforms.ToPILImage()(out_tensor.cpu())
    out_img.save(out_path)
    print(f"Saved upscaled image to: {out_path}")

if __name__ == "__main__":
    main()
