import { useEffect, useRef } from "react";

/**
 * 全局背景层：
 * 1. 深邃黑灰渐变底
 * 2. Canvas 数字雨 —— 低透明度的英文字母 / 数学符号垂直下落（幽蓝青色）
 * 3. 底部 SVG 发光波浪线
 */
export default function RainBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 下落字符集：英文字母 + 数学符号
    const CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ∑∫πΔθλμφΩ√∞≈≠±∂∇∈∀∃0123456789";
    const FONT_SIZE = 14;

    let width = 0;
    let height = 0;
    let columns = 0;
    let drops: number[] = [];
    let speeds: number[] = [];
    let raf = 0;
    let lastTime = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      columns = Math.floor(width / FONT_SIZE);
      drops = Array.from({ length: columns }, () => Math.random() * (height / FONT_SIZE));
      speeds = Array.from({ length: columns }, () => 0.4 + Math.random() * 0.8);
    };

    const draw = (time: number) => {
      raf = requestAnimationFrame(draw);
      // 30fps 限速，降低功耗
      if (time - lastTime < 33) return;
      lastTime = time;

      // 拖尾：半透明黑色覆盖
      ctx.fillStyle = "rgba(7, 9, 12, 0.14)";
      ctx.fillRect(0, 0, width, height);

      ctx.font = `${FONT_SIZE}px "GeistMono", monospace`;

      for (let i = 0; i < columns; i++) {
        const ch = CHARS[Math.floor(Math.random() * CHARS.length)];
        const x = i * FONT_SIZE;
        const y = drops[i] * FONT_SIZE;

        // 头部字符稍亮，整体保持低透明度
        const head = Math.random() > 0.975;
        ctx.fillStyle = head
          ? "rgba(165, 243, 252, 0.55)" // 幽蓝高亮
          : "rgba(103, 232, 249, 0.13)"; // 暗青拖尾
        ctx.fillText(ch, x, y);

        drops[i] += speeds[i];
        if (y > height && Math.random() > 0.976) drops[i] = 0;
      }
    };

    resize();
    raf = requestAnimationFrame(draw);
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-0" aria-hidden id="rain-bg">
      {/* 深邃黑灰渐变底 */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 0%, #11151c 0%, #0a0d12 45%, #05070a 100%)",
        }}
      />
      {/* 数字雨 */}
      <canvas ref={canvasRef} className="absolute inset-0 opacity-70" />
      {/* 底部发光波浪 */}
      <svg
        className="absolute bottom-0 left-0 h-40 w-full"
        viewBox="0 0 1440 160"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="waveGlow" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(96,165,250,0)" />
            <stop offset="50%" stopColor="rgba(96,165,250,0.55)" />
            <stop offset="100%" stopColor="rgba(96,165,250,0)" />
          </linearGradient>
          <filter id="blur6" x="-20%" y="-200%" width="140%" height="500%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>
        <path
          d="M0,96 C240,64 360,128 720,104 C1080,80 1200,120 1440,88"
          fill="none"
          stroke="url(#waveGlow)"
          strokeWidth="10"
          filter="url(#blur6)"
          opacity="0.5"
        />
        <path
          d="M0,96 C240,64 360,128 720,104 C1080,80 1200,120 1440,88"
          fill="none"
          stroke="url(#waveGlow)"
          strokeWidth="1.5"
          opacity="0.9"
        />
        <path
          d="M0,120 C260,96 420,144 760,124 C1100,104 1260,140 1440,112"
          fill="none"
          stroke="url(#waveGlow)"
          strokeWidth="1"
          opacity="0.4"
        />
      </svg>
    </div>
  );
}
