import Foundation
import CoreText
import CoreGraphics
// usage: logo font.ttf "text" size out.svg fill
let a = CommandLine.arguments
let url = URL(fileURLWithPath: a[1]) as CFURL
let descs = CTFontManagerCreateFontDescriptorsFromURL(url) as! [CTFontDescriptor]
var font = CTFontCreateWithFontDescriptor(descs[0], CGFloat(Double(a[3])!), nil)
// pin variable weight to 400
let wghtTag = 0x77676874
let vd = CTFontDescriptorCreateCopyWithVariation(CTFontCopyFontDescriptor(font), wghtTag as CFNumber, 400)
font = CTFontCreateWithFontDescriptor(vd, CGFloat(Double(a[3])!), nil)
let attr = NSAttributedString(string: a[2], attributes: [NSAttributedString.Key(kCTFontAttributeName as String): font])
let line = CTLineCreateWithAttributedString(attr)
let path = CGMutablePath()
let runs = CTLineGetGlyphRuns(line) as! [CTRun]
for run in runs {
  let n = CTRunGetGlyphCount(run)
  var glyphs = [CGGlyph](repeating: 0, count: n); var pos = [CGPoint](repeating: .zero, count: n)
  CTRunGetGlyphs(run, CFRange(location: 0, length: n), &glyphs); CTRunGetPositions(run, CFRange(location: 0, length: n), &pos)
  for i in 0..<n { if let g = CTFontCreatePathForGlyph(font, glyphs[i], nil) { path.addPath(g, transform: CGAffineTransform(translationX: pos[i].x, y: pos[i].y)) } }
}
let b = path.boundingBoxOfPath
let asc = CTFontGetAscent(font), desc = CTFontGetDescent(font)
var d = ""
func f(_ v: CGFloat) -> String { String(format: "%.2f", v) }
// flip y: svgY = asc - y ; x shifted by -b.minX
path.applyWithBlock { e in
  let p = e.pointee.points
  func P(_ q: CGPoint) -> String { f(q.x - b.minX) + " " + f(asc - q.y) }
  switch e.pointee.type {
  case .moveToPoint: d += "M" + P(p[0])
  case .addLineToPoint: d += "L" + P(p[0])
  case .addQuadCurveToPoint: d += "Q" + P(p[0]) + " " + P(p[1])
  case .addCurveToPoint: d += "C" + P(p[0]) + " " + P(p[1]) + " " + P(p[2])
  case .closeSubpath: d += "Z"
  @unknown default: break }
}
let W = b.width, H = asc + desc
let svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 \(f(W)) \(f(H))\" width=\"\(f(W))\" height=\"\(f(H))\" role=\"img\" aria-label=\"\(a[2])\"><path fill=\"\(a[5])\" d=\"\(d)\"/></svg>\n"
try! svg.write(toFile: a[4], atomically: true, encoding: .utf8)
print("ok", W, H)
