import onnx

model_path = "public/generator_latest.onnx"
print(f"Loading {model_path}...")
model = onnx.load(model_path)

input_tensor = model.graph.input[0]
output_tensor = model.graph.output[0]

print("--- INPUT ---")
input_dims = input_tensor.type.tensor_type.shape.dim
print([d.dim_value if d.dim_value > 0 else (d.dim_param or '?') for d in input_dims])

print("--- OUTPUT ---")
output_dims = output_tensor.type.tensor_type.shape.dim
print([d.dim_value if d.dim_value > 0 else (d.dim_param or '?') for d in output_dims])

# Logic to fix Output if it is dynamic
# We know scale is x2. Input is 128 -> Output 256.
expected_output = [1, 3, 256, 256]

full_dynamic = False
out_shape_vals = []
for d in output_dims:
    if d.dim_value > 0:
        out_shape_vals.append(d.dim_value)
    else:
        out_shape_vals.append("?")
        full_dynamic = True

if full_dynamic:
    print("Output has dynamic dimensions! Fixing to [1, 3, 256, 256]...")
    del output_tensor.type.tensor_type.shape.dim[:]
    for val in expected_output:
        d = output_tensor.type.tensor_type.shape.dim.add()
        d.dim_value = val

    onnx.save(model, "public/generator_fixed_completely.onnx")
    print("Saved public/generator_fixed_completely.onnx")
else:
    print("Output dimensions seem concrete.")
