#!/bin/bash
echo "=== Vérification qualité images IRCO ==="
echo ""
echo "## Assets principaux"
for img in assets/*.{jpg,png} prototypes/images/*.{jpg,png}; do
  if [ -f "$img" ]; then
    size=$(stat -f%z "$img" 2>/dev/null || stat -c%s "$img" 2>/dev/null)
    size_kb=$((size / 1024))
    dims=$(file "$img" | grep -oE '[0-9]+x[0-9]+' || identify -format '%wx%h' "$img" 2>/dev/null || echo "N/A")
    quality=$(identify -verbose "$img" 2>/dev/null | grep -i quality | head -1 || echo "N/A")
    echo "  $img"
    echo "    Taille: ${size_kb} Ko"
    echo "    Dimensions: ${dims}"
    echo "    $quality"
    
    # Check si > 500 Ko
    if [ $size_kb -gt 500 ]; then
      echo "    ⚠️  TROP LOURD (> 500 Ko) - compression recommandée"
    else
      echo "    ✓ Taille acceptable"
    fi
    echo ""
  fi
done
