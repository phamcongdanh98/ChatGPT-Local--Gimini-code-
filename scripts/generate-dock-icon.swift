import Cocoa

func renderMacIcon(sourcePath: String, outputPngPath: String) {
    guard let sourceImage = NSImage(contentsOfFile: sourcePath) else {
        print("Failed to load source image from \(sourcePath)")
        exit(1)
    }

    let canvasSize: CGFloat = 1024
    let iconSize: CGFloat = 824
    let cornerRadius: CGFloat = 185
    let offset = (canvasSize - iconSize) / 2

    let rep = NSBitmapImageRep(
        bitmapDataPlanes: nil,
        pixelsWide: Int(canvasSize),
        pixelsHigh: Int(canvasSize),
        bitsPerSample: 8,
        samplesPerPixel: 4,
        hasAlpha: true,
        isPlanar: false,
        colorSpaceName: .deviceRGB,
        bytesPerRow: 0,
        bitsPerPixel: 0
    )!

    NSGraphicsContext.saveGraphicsState()
    let context = NSGraphicsContext(bitmapImageRep: rep)!
    NSGraphicsContext.current = context
    context.cgContext.setAllowsAntialiasing(true)
    context.cgContext.setShouldAntialias(true)

    // Clear background to full 100% transparency
    context.cgContext.clear(CGRect(x: 0, y: 0, width: canvasSize, height: canvasSize))

    // Draw subtle macOS icon drop shadow
    let shadow = NSShadow()
    shadow.shadowColor = NSColor.black.withAlphaComponent(0.35)
    shadow.shadowOffset = NSSize(width: 0, height: -18)
    shadow.shadowBlurRadius = 32
    shadow.set()

    let iconRect = NSRect(x: offset, y: offset, width: iconSize, height: iconSize)
    let clipPath = NSBezierPath(roundedRect: iconRect, xRadius: cornerRadius, yRadius: cornerRadius)
    
    // Fill shadow base
    NSColor.black.setFill()
    clipPath.fill()

    // Now clip and draw image inside squircle
    shadow.shadowColor = nil
    shadow.set()
    clipPath.addClip()

    // Draw source image scaled to fill
    sourceImage.draw(in: iconRect, from: NSRect(origin: .zero, size: sourceImage.size), operation: .sourceOver, fraction: 1.0)

    // Draw subtle top-to-bottom inner bevel border
    context.cgContext.resetClip()
    let borderPath = NSBezierPath(roundedRect: iconRect.insetBy(dx: 1, dy: 1), xRadius: cornerRadius - 1, yRadius: cornerRadius - 1)
    borderPath.lineWidth = 2.0
    NSColor.white.withAlphaComponent(0.18).setStroke()
    borderPath.stroke()

    NSGraphicsContext.restoreGraphicsState()

    if let pngData = rep.representation(using: .png, properties: [:]) {
        try? pngData.write(to: URL(fileURLWithPath: outputPngPath))
        print("Generated clean transparent PNG at \(outputPngPath)")
    }
}

if CommandLine.arguments.count > 2 {
    renderMacIcon(sourcePath: CommandLine.arguments[1], outputPngPath: CommandLine.arguments[2])
} else {
    print("Usage: swift generate-dock-icon.swift <input.jpg> <output.png>")
}
