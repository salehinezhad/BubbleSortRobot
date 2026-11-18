from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "public" / "images"
OUTPUT_DIR = SOURCE_DIR / "stage"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def prepare_robot(number: int) -> None:
    source = SOURCE_DIR / f"robot-{number}.jpg"
    image = Image.open(source).convert("RGB")

    flood_image = image.copy()
    ImageDraw.floodfill(
        flood_image,
        xy=(0, 0),
        value=(255, 0, 255),
        thresh=18,
    )

    rgba = image.convert("RGBA")
    source_pixels = rgba.load()
    flood_pixels = flood_image.load()

    for y in range(rgba.height):
        for x in range(rgba.width):
            if flood_pixels[x, y] == (255, 0, 255):
                red, green, blue, _ = source_pixels[x, y]
                source_pixels[x, y] = (red, green, blue, 0)

    alpha_box = rgba.getchannel("A").getbbox()
    if alpha_box is None:
        raise RuntimeError(f"No robot pixels found in {source.name}")

    padding = 8
    left = max(0, alpha_box[0] - padding)
    top = max(0, alpha_box[1] - padding)
    right = min(rgba.width, alpha_box[2] + padding)
    bottom = min(rgba.height, alpha_box[3] + padding)
    cropped = rgba.crop((left, top, right, bottom))
    destination = OUTPUT_DIR / f"robot-{number}.png"
    cropped.save(destination, optimize=True)
    print(f"{source.name}: crop={(left, top, right, bottom)} size={cropped.size}")


for robot_number in range(1, 8):
    prepare_robot(robot_number)
