import onnx
import os

model_path = "public/generator_latest.onnx"
output_path = "public/generator_fixed.onnx"

print(f"Loading model from {model_path}...")
try:
    # Load the model. load_external_data=False implies it will load external data if the file path is valid in the proto.
    # We might need to handle external data loading explicitely if it fails, but usually onnx.load works if files are adjacent.
    model = onnx.load(model_path)

    # Check current input
    input_tensor = model.graph.input[0]
    print(f"Current Input Name: {input_tensor.name}")

    # Get shape dims
    dims = input_tensor.type.tensor_type.shape.dim
    current_shape = []
    for d in dims:
        if d.dim_value > 0:
            current_shape.append(str(d.dim_value))
        elif d.dim_param:
            current_shape.append(d.dim_param)
        else:
            current_shape.append("?")
    print(f"Current Input Shape: {current_shape}")

    # Fix dimensions: [1, 3, 128, 128]
    # We override the first dimension (batch) to be exactly 1
    # and ensure the others are 3, 128, 128

    print("Modifying dimensions to fixed [1, 3, 128, 128]...")

    new_shape = [1, 3, 128, 128]
    if len(dims) != 4:
         print("Warning: Input rank is not 4. Adjusting or aborting if unsure.")
         # If existing is generic, we just force it.

    # Clear old dims and set new ones
    del input_tensor.type.tensor_type.shape.dim[:]

    for val in new_shape:
        d = input_tensor.type.tensor_type.shape.dim.add()
        d.dim_value = val

    # Verify input name is standard (optional, but 'input' is conventional)
    # if input_tensor.name != 'input':
    #    print(f"Renaming input from {input_tensor.name} to 'input'")
    #    input_tensor.name = 'input'
    #    # Note:Renaming requires traversing the whole graph to replace references. Skipping for safety.

    print("Saving model as a SINGLE file (no external data)...")
    # This will inline the weights into the .onnx file since it's small (~11MB)
    onnx.save(model, output_path)

    print(f"Success! Fixed model saved to {output_path}")
    print("Please update your code to use 'generator_fixed.onnx' and you should be good to go.")

except Exception as e:
    print(f"Error: {e}")
