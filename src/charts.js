/* ==========================================================================
   练迹 · 图表引擎
   纯 SVG 手写，零依赖，离线可用
   ========================================================================== */
(function (global) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';

  function el(tag, attrs = {}, children = []) {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v !== null && v !== undefined) n.setAttribute(k, v);
    }
    for (const c of [].concat(children)) {
      if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return n;
  }

  function niceTicks(min, max, count = 4) {
    if (min === max) { min -= 1; max += 1; }
    const span = max - min;
    const step0 = span / count;
    const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const norm = step0 / mag;
    let step;
    if (norm <= 1) step = 1;
    else if (norm <= 2) step = 2;
    else if (norm <= 2.5) step = 2.5;
    else if (norm <= 5) step = 5;
    else step = 10;
    step *= mag;
    const lo = Math.floor(min / step) * step;
    const hi = Math.ceil(max / step) * step;
    const ticks = [];
    for (let v = lo; v <= hi + step * 0.001; v += step) ticks.push(Math.round(v * 1000) / 1000);
    return { lo, hi, ticks };
  }

  /**
   * 折线图
   * @param {Array<{date:string,value:number}>} data
   * @param {Object} opts { height, color, fill, unit, showDots, yLabel }
   */
  function lineChart(data, opts = {}) {
    const W = 320, H = opts.height || 170;
    const padL = 34, padR = 12, padT = 16, padB = 26;
    const iw = W - padL - padR;
    const ih = H - padT - padB;

    const svg = el('svg', {
      viewBox: `0 0 ${W} ${H}`,
      width: '100%',
      preserveAspectRatio: 'none',
      class: 'chart-svg',
      style: `height:${H}px;display:block;overflow:visible`,
    });

    if (!data || data.length === 0) {
      svg.appendChild(el('text', {
        x: W / 2, y: H / 2, 'text-anchor': 'middle',
        fill: 'var(--text-3)', 'font-size': '12',
      }, '暂无数据'));
      return svg;
    }

    const values = data.map((d) => d.value);
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const pad = (rawMax - rawMin) * 0.18 || Math.max(1, rawMax * 0.08);
    const { lo, hi, ticks } = niceTicks(rawMin - pad, rawMax + pad, 4);

    const x = (i) => padL + (data.length === 1 ? iw / 2 : (i / (data.length - 1)) * iw);
    const y = (v) => padT + ih - ((v - lo) / (hi - lo)) * ih;

    // 网格 + Y 轴刻度
    ticks.forEach((t) => {
      const yy = y(t);
      svg.appendChild(el('line', {
        x1: padL, y1: yy, x2: W - padR, y2: yy,
        stroke: 'var(--line-soft)', 'stroke-width': 1,
      }));
      svg.appendChild(el('text', {
        x: padL - 7, y: yy + 3.5, 'text-anchor': 'end',
        fill: 'var(--text-3)', 'font-size': '9.5', 'font-family': 'inherit',
      }, String(t)));
    });

    const color = opts.color || 'var(--brand)';

    // 渐变填充
    const gradId = 'lg-' + Math.random().toString(36).slice(2, 8);
    const defs = el('defs');
    const grad = el('linearGradient', { id: gradId, x1: 0, y1: 0, x2: 0, y2: 1 });
    grad.appendChild(el('stop', { offset: '0%', 'stop-color': color, 'stop-opacity': 0.26 }));
    grad.appendChild(el('stop', { offset: '100%', 'stop-color': color, 'stop-opacity': 0 }));
    defs.appendChild(grad);
    svg.appendChild(defs);

    const pts = data.map((d, i) => [x(i), y(d.value)]);
    const linePath = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ');
    const areaPath = `${linePath} L${pts[pts.length - 1][0]},${padT + ih} L${pts[0][0]},${padT + ih} Z`;

    svg.appendChild(el('path', { d: areaPath, fill: `url(#${gradId})` }));
    svg.appendChild(el('path', {
      d: linePath, fill: 'none', stroke: color,
      'stroke-width': 2.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    }));

    // 数据点
    if (opts.showDots !== false) {
      pts.forEach((p, i) => {
        const isLast = i === pts.length - 1;
        svg.appendChild(el('circle', {
          cx: p[0], cy: p[1], r: isLast ? 4 : 2.6,
          fill: isLast ? color : 'var(--bg-elev)',
          stroke: color, 'stroke-width': 2,
        }));
      });
    }

    // X 轴标签（最多 4 个，避免拥挤）
    const step = Math.max(1, Math.ceil(data.length / 4));
    data.forEach((d, i) => {
      if (i % step !== 0 && i !== data.length - 1) return;
      const label = d.date.slice(5).replace('-', '/');
      svg.appendChild(el('text', {
        x: x(i), y: H - 8, 'text-anchor': i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle',
        fill: 'var(--text-3)', 'font-size': '9.5', 'font-family': 'inherit',
      }, label));
    });

    return svg;
  }

  /**
   * 柱状图（周训练量等）
   * @param {Array<{label:string,value:number}>} data
   */
  function barChart(data, opts = {}) {
    const W = 320, H = opts.height || 150;
    const padL = 30, padR = 10, padT = 14, padB = 24;
    const iw = W - padL - padR, ih = H - padT - padB;

    const svg = el('svg', {
      viewBox: `0 0 ${W} ${H}`, width: '100%',
      preserveAspectRatio: 'none',
      style: `height:${H}px;display:block`,
    });

    if (!data || !data.length) {
      svg.appendChild(el('text', {
        x: W / 2, y: H / 2, 'text-anchor': 'middle',
        fill: 'var(--text-3)', 'font-size': '12',
      }, '暂无数据'));
      return svg;
    }

    const max = Math.max(...data.map((d) => d.value), 1);
    const { hi, ticks } = niceTicks(0, max, 3);
    const y = (v) => padT + ih - (v / hi) * ih;

    ticks.forEach((t) => {
      svg.appendChild(el('line', {
        x1: padL, y1: y(t), x2: W - padR, y2: y(t),
        stroke: 'var(--line-soft)', 'stroke-width': 1,
      }));
      svg.appendChild(el('text', {
        x: padL - 6, y: y(t) + 3.5, 'text-anchor': 'end',
        fill: 'var(--text-3)', 'font-size': '9', 'font-family': 'inherit',
      }, String(t)));
    });

    const slot = iw / data.length;
    const bw = Math.min(slot * 0.56, 26);
    const color = opts.color || 'var(--brand)';

    data.forEach((d, i) => {
      const cx = padL + slot * i + slot / 2;
      const h = Math.max(2, (d.value / hi) * ih);
      const isLast = i === data.length - 1;
      svg.appendChild(el('rect', {
        x: cx - bw / 2, y: padT + ih - h,
        width: bw, height: h, rx: Math.min(5, bw / 2.6),
        fill: color, opacity: isLast ? 1 : 0.42,
      }));
      svg.appendChild(el('text', {
        x: cx, y: H - 7, 'text-anchor': 'middle',
        fill: 'var(--text-3)', 'font-size': '9', 'font-family': 'inherit',
      }, d.label));
    });

    return svg;
  }

  /**
   * 环形进度
   */
  function ring(percent, opts = {}) {
    const size = opts.size || 92;
    const sw = opts.stroke || 8;
    const r = (size - sw) / 2;
    const c = 2 * Math.PI * r;
    const p = Math.max(0, Math.min(1, percent));
    const svg = el('svg', {
      viewBox: `0 0 ${size} ${size}`,
      width: size, height: size,
      style: 'display:block',
    });
    svg.appendChild(el('circle', {
      cx: size / 2, cy: size / 2, r,
      fill: 'none', stroke: 'var(--bg-elev-2)', 'stroke-width': sw,
    }));
    svg.appendChild(el('circle', {
      cx: size / 2, cy: size / 2, r,
      fill: 'none', stroke: opts.color || 'var(--brand)',
      'stroke-width': sw, 'stroke-linecap': 'round',
      'stroke-dasharray': `${c * p} ${c}`,
      transform: `rotate(-90 ${size / 2} ${size / 2})`,
      style: 'transition:stroke-dasharray .6s cubic-bezier(.22,.61,.36,1)',
    }));
    const t = el('text', {
      x: size / 2, y: size / 2 + 1, 'text-anchor': 'middle',
      'dominant-baseline': 'middle',
      fill: 'var(--text)', 'font-size': size * 0.26,
      'font-weight': '800', 'font-family': 'inherit',
    }, String(Math.round(p * 100)));
    svg.appendChild(t);
    return svg;
  }

  global.LJChart = { lineChart, barChart, ring };
})(window);
