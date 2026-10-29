import mark from "../assets/logo-mark.png";
import full from "../assets/logo-full.png";

export function LogoMark({ size = 40 }: { size?: number }) {
  return <img src={mark} alt="" width={size} height={Math.round(size * 0.985)} style={{ flex: "none", display: "block" }} />;
}

export function LogoFull({ width = 220 }: { width?: number }) {
  return <img src={full} alt="SmartManager Loyalty" width={width} style={{ display: "block", margin: "0 auto", maxWidth: "70%", height: "auto" }} />;
}
