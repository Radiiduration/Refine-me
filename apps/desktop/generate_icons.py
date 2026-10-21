from PIL import Image
import os

icon_dir = "apps/desktop/src-tauri/icons"
os.makedirs(icon_dir, exist_ok=True)

sizes = [16, 32, 128, 256, 512]
for size in sizes:
    # Create a simple blue square with a white circle as a placeholder icon
    img = Image.new('RGB', (size, size), color=(0, 123, 255))
    # Draw a simple white circle/dot in the middle
    from PIL import ImageDraw
    draw = ImageDraw.Draw(img)
    margin = size // 4
    draw.ellipse([margin, margin, size - margin, size - margin], fill=(255, 255, 255))

    img.save(os.path.join(icon_dir, f"{size}x{size}.png"))

# Also save as icon.png for the macro
img.save(os.path.join(icon_dir, "icon.png"))
print("Icons generated successfully.")
