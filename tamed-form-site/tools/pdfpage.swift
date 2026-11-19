import Foundation
import PDFKit
import AppKit
// usage: pdfpage in.pdf page(1-based) out.png maxWidth
let a = CommandLine.arguments
guard a.count >= 5, let doc = PDFDocument(url: URL(fileURLWithPath: a[1])), let p = doc.page(at: Int(a[2])! - 1) else { print("bad"); exit(1) }
let box = p.bounds(for: .mediaBox)
let w = CGFloat(Double(a[4])!), s = w / box.width, h = box.height * s
let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(w), pixelsHigh: Int(h), bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
let ctx = NSGraphicsContext(bitmapImageRep: rep)!
NSGraphicsContext.current = ctx
let cg = ctx.cgContext
cg.setFillColor(NSColor.white.cgColor); cg.fill(CGRect(x: 0, y: 0, width: w, height: h))
cg.scaleBy(x: s, y: s); cg.translateBy(x: -box.minX, y: -box.minY)
p.draw(with: .mediaBox, to: cg)
NSGraphicsContext.restoreGraphicsState()
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: a[3]))
print("ok", Int(w), Int(h), doc.pageCount)
