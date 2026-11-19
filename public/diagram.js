// Animated redraw of the "Diagnostic Map" cross-section. Exposes window.dmSvg(labels) and window.dmInit().
(function () {
  const N = '#0A2347', O = '#E8761C';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // callout: [labelIndex, boxX, boxY, targetX, targetY, glyph]
  const WARN = 'M12 3 L22 21 H2 Z M12 10 V15 M12 18 V18.5';
  const DROP = 'M12 3 C12 3 5 12 5 16 A7 7 0 0 0 19 16 C19 12 12 3 12 3 Z';
  const CRACK = 'M13 3 L9 11 L15 13 L10 21';
  const CALLS = [
    [0, 196, 104, 172, 214, WARN], [1, 372, 138, 346, 258, DROP], [2, 440, 272, 402, 312, WARN], [3, 620, 118, 742, 322, CRACK],
    [4, 498, 196, 592, 322, CRACK], [5, 790, 190, 905, 304, WARN], [6, 690, 430, 628, 430, WARN], [7, 110, 472, 236, 430, WARN]
  ];
  const SLIP = 'M76 124 Q160 214 276 304';
  const DUMPFACE = 'M884 256 L985 340';

  const dr = (d, delay, extra = '') => `<path d="${d}" pathLength="1" class="dr" style="--d:${delay}s" ${extra}/>`;

  function stipple() {
    let out = '', seed = 7;
    const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    for (let i = 0; i < 26; i++) {
      const x = 170 + rnd() * 170, y = 410 + rnd() * 90;
      out += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(1.2 + rnd() * 1.6).toFixed(1)}" class="weak" style="--d:${(rnd() * 2.4).toFixed(1)}s"/>`;
    }
    return out;
  }

  function callouts(labels) {
    return CALLS.map(([li, x, y, tx, ty, g], k) => {
      const text = String(labels[li] || '').toUpperCase();
      if (!text) return '';
      const w = Math.round(48 + text.length * 7.4), h = 32;
      const vert = ty > y + h || ty < y;
      const sx = Math.max(x + 10, Math.min(tx, x + w - 10));
      const line = vert ? `M${sx} ${ty > y ? y + h : y} V${ty > y ? ty - 8 : ty + 8}` : `M${tx > x ? x + w : x} ${y + h / 2} H${tx > x ? tx - 8 : tx + 8}`;
      const d = 2.2 + k * 0.28;
      return `<g class="co" style="--d:${d}s">
        <path d="${line}" pathLength="1" class="arrow" stroke="${O}" stroke-width="1.8" fill="none" style="--d:${d + 0.15}s"/>
        <circle cx="${tx}" cy="${ty}" r="4.5" fill="${O}"/><circle cx="${tx}" cy="${ty}" r="4.5" fill="none" stroke="${O}" stroke-width="1.5" class="ring" style="--d:${k * 0.35}s"/>
        <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff" stroke="${O}" stroke-width="1.4"/>
        <rect x="${x}" y="${y}" width="32" height="${h}" fill="${O}"/>
        <g transform="translate(${x + 4} ${y + 4}) scale(.96)" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${g}"/></g>
        <text x="${x + 40}" y="${y + 21}" font-family="Manrope,sans-serif" font-size="12" font-weight="700" letter-spacing=".5" fill="${N}">${esc(text)}</text></g>`;
    }).join('');
  }

  window.dmSvg = function (labels) {
    const slipRocks = [0, 1, 2].map((i) => `<polygon class="rock" points="0,0 9,-3 12,5 3,8" style="offset-path:path('${SLIP}');--d:${i * 1.5}s"/>`).join('');
    const dumpArrows = [0, 1].map((i) => `<polygon class="rock" points="0,-5 8,5 -8,5" style="offset-path:path('${DUMPFACE}');--d:${i * 1.6}s;fill:${O}"/>`).join('');
    return `<svg class="dm" viewBox="0 0 1000 540" role="img" aria-label="Animated cross-section showing eight ground and infrastructure vulnerabilities: slope failure, water ingress, tunnel distress, underground voids, settlement, mine dump instability, foundation distress and weak ground">
    <defs>
      <pattern id="dmDots" width="10" height="10" patternUnits="userSpaceOnUse"><circle cx="2" cy="3" r=".9" fill="${N}" opacity=".5"/><circle cx="7" cy="8" r=".9" fill="${N}" opacity=".5"/></pattern>
      <pattern id="dmHatch" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="9" stroke="${N}" stroke-width=".8" opacity=".35"/></pattern>
      <clipPath id="dmTunnel"><circle cx="345" cy="312" r="40"/></clipPath>
    </defs>
    <g class="fillin"><polygon points="0,372 270,478 232,540 0,540" fill="url(#dmDots)" opacity=".7"/>
      <path d="M470 408 C600 436 760 444 1000 414 L1000 456 C760 486 600 476 470 446 Z" fill="url(#dmHatch)"/>
      <polygon points="0,330 30,230 72,125 112,42 146,92 196,158 240,222 284,258 258,330 0,380" fill="url(#dmHatch)" opacity=".7"/></g>
    <g fill="none" stroke="${N}" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round">
      ${dr('M0 372 L270 478', 0.2)}${dr('M0 430 L232 540', 0.3)}${dr('M0 330 L246 424 L300 540', 0.4, 'opacity=".5"')}${dr('M120 340 L330 424 L372 540', 0.5, 'opacity=".5"')}
      ${dr('M205 300 L420 396', 0.6, 'opacity=".4"')}${dr('M470 408 C600 436 760 444 1000 414', 0.7)}${dr('M470 446 C600 476 760 486 1000 456', 0.8)}
      ${dr('M480 494 C700 520 860 516 1000 496', 0.9, 'opacity=".5"')}
      ${dr('M118 38 L124 84 L108 122 M150 94 L134 142 L158 184 M80 112 L98 170 L62 226', 1.0, 'opacity=".4"')}
      ${dr('M0 330 L30 230 L72 125 L112 42 L146 92 L196 158 L240 222 L284 258 L330 246 L366 214 L398 202 L430 218 L458 252 L488 292 L518 312 L540 313 Q585 336 626 314 L652 314', 0, 'stroke-width="2"')}
      <!-- slip surface -->
      ${dr('M68 132 Q158 224 280 314', 1.2, 'stroke-width="9" opacity=".14"')}${dr(SLIP, 1.3, 'stroke="' + O + '" stroke-width="2" data-flow="1"')}
      <!-- tunnel -->
      <circle cx="345" cy="312" r="56" fill="#fff" stroke-width="2.6" pathLength="1" class="dr" style="--d:1.4s"/><circle cx="345" cy="312" r="44" stroke-width="1" opacity=".7"/>
      <path d="M305 312 H385 M345 272 V352" stroke-dasharray="3 4" opacity=".45"/><path d="M318 340 H372" stroke-width="2"/>
      ${dr('M392 296 l-9 5 l5 8 l-8 7', 2.0, 'stroke="' + O + '" stroke-width="1.6"')}${dr('M298 322 l9 -3 l-2 8', 2.1, 'stroke="' + O + '" stroke-width="1.4"')}
      <g clip-path="url(#dmTunnel)" stroke="none" fill="${O}"><path class="drop" style="--d:0s" d="M330 276 q4 8 0 11 q-4 -3 0 -11z"/><path class="drop" style="--d:.7s" d="M350 272 q4 8 0 11 q-4 -3 0 -11z"/><path class="drop" style="--d:1.4s" d="M364 278 q4 8 0 11 q-4 -3 0 -11z"/></g>
      <path class="seep" d="M345 256 C340 244 352 236 346 224" stroke="${O}"/>
      <!-- foundation -->
      <path d="M652 250 H664 V350 H652 Z" fill="#fff" stroke-width="1.6" pathLength="1" class="dr" style="--d:1.5s"/>
      <g class="settle"><rect x="500" y="338" width="160" height="12" fill="#fff" stroke-width="1.6"/>
        ${[516, 543, 570, 597, 624].map((x) => `<rect x="${x - 5}" y="350" width="10" height="138" fill="#fff" stroke-width="1.4"/>`).join('')}
        ${dr('M570 354 L573 386 L568 416 L572 446', 2.4, 'stroke="' + O + '" stroke-width="1.5" opacity=".9"')}</g>
      <path d="M545 300 H640" stroke="${O}" stroke-dasharray="4 5" stroke-width="1.2" opacity=".8" class="lvl"/>
      <!-- mine dump -->
      <path d="M664 252 H884 L985 340 V412 H664 Z" fill="#fff" stroke-width="1.8" pathLength="1" class="dr" style="--d:1.6s"/>
      ${dr('M676 282 H870 L964 354 M676 308 H862 L976 384 M676 334 H850 L982 408', 1.9, 'opacity=".5"')}
      ${dr('M800 252 Q905 298 978 348', 2.3, 'stroke="' + O + '" stroke-width="1.8" data-flow="1"')}
      <!-- void -->
      <path class="void" d="M694 352 C686 314 716 296 750 304 C786 310 800 342 782 368 L694 368 Z" fill="#fff" stroke-width="1.8"/>
      <path d="M706 352 L722 338 L738 350 M752 352 L766 340" opacity=".5" stroke-width="1"/>
      <circle class="rubble" cx="730" cy="320" r="2.2" fill="${N}" stroke="none" style="--d:0s"/><circle class="rubble" cx="754" cy="322" r="1.8" fill="${N}" stroke="none" style="--d:.9s"/>
    </g>
    <g stroke="none">${stipple()}</g>
    <g fill="${N}" stroke="none">${slipRocks}${dumpArrows}</g>
    <g class="sink" fill="${O}"><path d="M588 346 v22 M580 362 l8 10 l8 -10" fill="none" stroke="${O}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></g>
    ${callouts(labels)}
  </svg>`;
  };

  window.dmInit = function () {
    const svg = document.querySelector('svg.dm');
    if (!svg) return;
    const go = () => svg.classList.add('play');
    if (!('IntersectionObserver' in window)) return go();
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { go(); io.disconnect(); } }), { threshold: 0.25 });
    io.observe(svg);
    const rp = document.getElementById('dmReplay');
    if (rp) rp.onclick = () => { svg.classList.remove('play'); void svg.getBoundingClientRect(); svg.classList.add('play'); };
  };
})();
