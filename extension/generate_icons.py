#!/usr/bin/env python3
"""
Generate simple bookmark icons for the extension
"""

from PIL import Image, ImageDraw

def create_icon(size):
    """Create a simple bookmark icon"""
    # Create image with transparent background
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Calculate dimensions
    padding = size // 8
    width = size - (2 * padding)
    height = int(width * 1.2)
    
    # Center the bookmark
    x = padding
    y = (size - height) // 2
    
    # Draw bookmark shape (rectangle with notch at bottom)
    notch_width = width // 3
    notch_height = height // 4
    
    points = [
        (x, y),  # Top-left
        (x + width, y),  # Top-right
        (x + width, y + height - notch_height),  # Right before notch
        (x + width // 2 + notch_width // 2, y + height - notch_height),  # Notch right
        (x + width // 2, y + height),  # Notch point
        (x + width // 2 - notch_width // 2, y + height - notch_height),  # Notch left
        (x, y + height - notch_height),  # Left before notch
    ]
    
    # Draw filled bookmark
    draw.polygon(points, fill='#1a73e8', outline='#1557b0')
    
    # Add a small star or marker
    star_size = size // 6
    star_x = x + width // 2
    star_y = y + height // 3
    
    # Draw circle instead of star for simplicity
    draw.ellipse(
        [star_x - star_size, star_y - star_size, 
         star_x + star_size, star_y + star_size],
        fill='white'
    )
    
    return img

# Generate icons
sizes = [16, 48, 128]

for size in sizes:
    icon = create_icon(size)
    icon.save(f'/home/claude/bookmarking-system/extension/icons/icon{size}.png')
    print(f"Created icon{size}.png")

print("All icons created successfully!")
