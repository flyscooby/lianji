/* ==========================================================================
   练迹 · 视图层
   ========================================================================== */
(function (global) {
  'use strict';

  const S = global.LJStore;
  const C = global.LJChart;

  /* ---------- DOM 工具 ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  function h(tag, attrs = {}, children = []) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'dataset') Object.assign(n.dataset, v);
      else n.setAttribute(k, v);
    }
    for (const c of [].concat(children)) {
      if (c === null || c === undefined || c === false) continue;
      n.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    }
    return n;
  }

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

  const WD = ['日', '一', '二', '三', '四', '五', '六'];

  function fmtDateCN(dateStr) {
    const d = S.parseDate(dateStr);
    return `${d.getMonth() + 1}月${d.getDate()}日 周${WD[d.getDay()]}`;
  }

  function relativeDay(dateStr) {
    const t = S.todayStr();
    if (dateStr === t) return '今天';
    if (dateStr === S.addDays(t, -1)) return '昨天';
    if (dateStr === S.addDays(t, 1)) return '明天';
    return fmtDateCN(dateStr);
  }

  function volumeText(v) {
    if (v >= 10000) return (v / 1000).toFixed(1) + 't';
    return Math.round(v).toLocaleString('zh-CN');
  }

  /* ==========================================================================
     视图：今日
     ========================================================================== */
  function renderToday() {
    const today = S.todayStr();
    const week = S.statsForWeek();
    const goal = S.getSettings().weeklyGoal || 4;
    const streak = S.streakWeeks();
    const plan = S.getPlan(today);
    const todayWorkouts = S.getWorkoutsByDate(today);
    const templates = S.getTemplates();

    const root = h('div', {});

    /* Hero */
    const doneToday = todayWorkouts.length > 0;
    const planTpl = plan && plan.templateId ? S.getTemplate(plan.templateId) : null;
    const isRest = plan && plan.rest;

    let heroTitle, heroSub;
    if (doneToday) {
      heroTitle = '今天已完成';
      heroSub = todayWorkouts.map((w) => w.name).join(' · ');
    } else if (isRest) {
      heroTitle = '今天是休息日';
      heroSub = '恢复也是训练的一部分';
    } else if (planTpl) {
      heroTitle = planTpl.name;
      heroSub = planTpl.focus || '';
    } else {
      heroTitle = '今天练什么？';
      heroSub = '选择一个模板，或自由开始一次训练';
    }

    const hero = h('div', { class: 'hero' }, [
      h('div', { class: 'hero-date' }, fmtDateCN(today).toUpperCase()),
      h('div', { class: 'hero-title' }, heroTitle),
      h('div', { class: 'hero-sub' }, heroSub),
    ]);

    const ctaRow = h('div', { class: 'hero-cta' });
    if (doneToday) {
      ctaRow.appendChild(h('button', {
        class: 'btn btn-primary grow',
        onclick: () => global.LJ.openWorkout(todayWorkouts[0].id),
      }, '查看今日训练'));
      ctaRow.appendChild(h('button', {
        class: 'btn btn-accent', onclick: () => global.LJ.startWorkout(planTpl ? planTpl.id : null),
      }, '再加一组'));
    } else {
      ctaRow.appendChild(h('button', {
        class: 'btn btn-accent grow',
        onclick: () => global.LJ.startWorkout(planTpl ? planTpl.id : null),
      }, planTpl ? '开始 ' + planTpl.name : '开始训练'));
      ctaRow.appendChild(h('button', {
        class: 'btn btn-primary', onclick: () => global.LJ.go('train'),
      }, '选模板'));
    }
    hero.appendChild(ctaRow);
    root.appendChild(hero);

    /* 本周统计 */
    const statRow = h('div', { class: 'stat-row' }, [
      h('div', { class: 'stat' }, [
        h('div', { class: 'stat-num' }, [
          String(week.count),
          h('span', { class: 'unit' }, '/' + goal),
        ]),
        h('div', { class: 'stat-label' }, '本周训练'),
      ]),
      h('div', { class: 'stat' }, [
        h('div', { class: 'stat-num' }, [
          String(streak),
          h('span', { class: 'unit' }, '周'),
        ]),
        h('div', { class: 'stat-label' }, '连续训练'),
      ]),
      h('div', { class: 'stat' }, [
        h('div', { class: 'stat-num', style: 'font-size:20px' }, volumeText(week.volume)),
        h('div', { class: 'stat-label' }, '本周容量 kg'),
      ]),
    ]);
    root.appendChild(statRow);

    /* 本周进度环 + 训练分布 */
    const progCard = h('div', { class: 'card' });
    progCard.appendChild(h('div', { class: 'card-head' }, [
      h('div', { class: 'card-title' }, '本周目标'),
      h('div', { class: 'muted', style: 'font-size:12.5px' }, `${week.count} / ${goal} 次`),
    ]));
    const progBody = h('div', { class: 'flex items-center gap10' });
    progBody.appendChild(C.ring(goal ? week.count / goal : 0, { size: 84, stroke: 7 }));
    const legend = h('div', { class: 'grow' }, [
      h('div', { class: 'flex between', style: 'padding:5px 0' }, [
        h('span', { class: 'muted', style: 'font-size:13px' }, '力量'),
        h('span', { style: 'font-weight:700;font-size:13.5px' }, week.strength + ' 次'),
      ]),
      h('div', { class: 'flex between', style: 'padding:5px 0' }, [
        h('span', { class: 'muted', style: 'font-size:13px' }, '有氧'),
        h('span', { style: 'font-weight:700;font-size:13.5px' }, week.cardio + ' 次'),
      ]),
      h('div', { class: 'flex between', style: 'padding:5px 0' }, [
        h('span', { class: 'muted', style: 'font-size:13px' }, '剩余'),
        h('span', { style: 'font-weight:700;font-size:13.5px;color:var(--brand)' },
          Math.max(0, goal - week.count) + ' 次'),
      ]),
    ]);
    progBody.appendChild(legend);
    progCard.appendChild(progBody);
    root.appendChild(progCard);

    /* 近期力量变化 */
    const trend = recentStrengthTrend();
    if (trend.length >= 2) {
      const card = h('div', { class: 'card' });
      const exName = trend[0].name;
      const diff = trend[0].value - trend[trend.length - 1].value;
      card.appendChild(h('div', { class: 'card-head' }, [
        h('div', { class: 'card-title' }, '近期力量'),
        h('span', {
          class: 'chip ' + (diff >= 0 ? 'chip-accent' : ''),
        }, `${exName} ${diff >= 0 ? '+' : ''}${S.round(diff, 1)}kg`),
      ]));
      card.appendChild(C.lineChart(
        trend.map((t) => ({ date: t.date, value: t.value })),
        { height: 130 }
      ));
      root.appendChild(card);
    }

    /* 今日详情 */
    if (doneToday) {
      const card = h('div', { class: 'card' });
      card.appendChild(h('div', { class: 'card-head' }, [
        h('div', { class: 'card-title' }, '今日明细'),
      ]));
      const list = h('div', { class: 'list' });
      todayWorkouts.forEach((w) => {
        list.appendChild(workoutRow(w, () => global.LJ.openWorkout(w.id)));
      });
      card.appendChild(list);
      root.appendChild(card);
    }

    /* 最近训练 */
    const all = S.getDB().workouts.slice(0, 5);
    if (all.length) {
      const card = h('div', { class: 'card' });
      card.appendChild(h('div', { class: 'card-head' }, [
        h('div', { class: 'card-title' }, '最近训练'),
        h('button', { class: 'btn btn-xs btn-ghost', onclick: () => global.LJ.go('stats') }, '全部'),
      ]));
      const list = h('div', { class: 'list' });
      all.forEach((w) => {
        list.appendChild(workoutRow(w, () => global.LJ.openWorkout(w.id)));
      });
      card.appendChild(list);
      root.appendChild(card);
    } else {
      root.appendChild(emptyState(
        '还没有训练记录',
        '点上面的「开始训练」，第一次记录就开始了。所有数据只存在你的手机里。'
      ));
    }

    return root;
  }

  function recentStrengthTrend() {
    // 找最近练得最多的力量动作
    const db = S.getDB();
    const counts = new Map();
    db.workouts.filter((w) => w.type === 'strength').slice(0, 12).forEach((w) => {
      (w.exercises || []).forEach((ex) => {
        if ((ex.sets || []).some((s) => s.done && s.weight > 0)) {
          counts.set(ex.name, (counts.get(ex.name) || 0) + 1);
        }
      });
    });
    if (!counts.size) return [];
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const hist = S.exerciseHistory(top).slice(-8);
    if (hist.length < 2) return [];
    return hist.map((p) => ({ date: p.date, value: p.weight, name: top }));
  }

  function workoutRow(w, onclick) {
    const isStrength = w.type === 'strength';
    const vol = S.volumeOf(w);
    const setCount = isStrength
      ? (w.exercises || []).reduce((a, ex) => a + (ex.sets || []).filter((s) => s.done).length, 0)
      : 0;

    let sub;
    if (isStrength) {
      const names = (w.exercises || []).map((e) => e.name).slice(0, 3).join('、');
      sub = `${setCount} 组 · ${volumeText(vol)}kg${names ? ' · ' + names : ''}`;
    } else {
      const c = w.cardio || {};
      sub = [c.duration ? c.duration + ' 分钟' : '', c.distance ? c.distance + ' km' : '']
        .filter(Boolean).join(' · ') || '有氧训练';
    }

    return h('div', { class: 'row', onclick, style: 'cursor:pointer' }, [
      h('div', {
        style: `width:4px;height:34px;border-radius:2px;flex:none;background:${isStrength ? 'var(--brand)' : 'var(--accent)'}`,
      }),
      h('div', { class: 'row-main' }, [
        h('div', { class: 'row-title' }, w.name || (isStrength ? '力量训练' : '有氧训练')),
        h('div', { class: 'row-sub' }, relativeDay(w.date) + ' · ' + sub),
      ]),
      h('svg', {
        viewBox: '0 0 24 24', width: '17', height: '17', fill: 'none',
        stroke: 'var(--text-3)', 'stroke-width': '2', 'stroke-linecap': 'round',
        style: 'flex:none',
      }, []).also((n) => n.appendChild(svgPath('M9 5l7 7-7 7'))),
    ]);
  }

  function svgPath(d) {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d);
    return p;
  }

  // 给 DOM 节点加个 also 方法方便链式
  if (!Element.prototype.also) {
    Element.prototype.also = function (fn) { fn(this); return this; };
  }

  function emptyState(title, desc, actionLabel, onAction) {
    const box = h('div', { class: 'empty' }, [
      h('div', { class: 'empty-title' }, title),
      h('div', { class: 'empty-desc' }, desc),
    ]);
    if (actionLabel && onAction) {
      box.appendChild(h('button', {
        class: 'btn btn-primary mt16', onclick: onAction,
      }, actionLabel));
    }
    return box;
  }

  /* ==========================================================================
     视图：训练（模板列表 + 历史）
     ========================================================================== */
  function renderTrain() {
    const templates = S.getTemplates();
    const root = h('div', {});

    root.appendChild(h('div', {
      style: 'display:flex;align-items:baseline;justify-content:space-between;margin:2px 2px 14px',
    }, [
      h('div', { style: 'font-size:22px;font-weight:800;letter-spacing:-.02em' }, '训练'),
      h('button', { class: 'btn btn-xs btn-ghost', onclick: () => global.LJ.startWorkout(null) }, '+ 空白训练'),
    ]));

    /* 力量模板 */
    const strengthTpls = templates.filter((t) => t.type === 'strength');
    const cardioTpls = templates.filter((t) => t.type === 'cardio');

    if (strengthTpls.length) {
      root.appendChild(h('div', {
        style: 'font-size:12px;font-weight:700;letter-spacing:.09em;color:var(--text-3);margin:0 2px 9px;text-transform:uppercase',
      }, '力量模板'));
      strengthTpls.forEach((tpl) => root.appendChild(templateCard(tpl)));
    }

    if (cardioTpls.length) {
      root.appendChild(h('div', {
        style: 'font-size:12px;font-weight:700;letter-spacing:.09em;color:var(--text-3);margin:16px 2px 9px;text-transform:uppercase',
      }, '有氧'));
      cardioTpls.forEach((tpl) => root.appendChild(templateCard(tpl)));
    }

    /* 最近历史 */
    const recent = S.getDB().workouts.slice(0, 8);
    if (recent.length) {
      const card = h('div', { class: 'card', style: 'margin-top:16px' });
      card.appendChild(h('div', { class: 'card-head' }, [
        h('div', { class: 'card-title' }, '历史记录'),
      ]));
      const list = h('div', { class: 'list' });
      recent.forEach((w) => list.appendChild(workoutRow(w, () => global.LJ.openWorkout(w.id))));
      card.appendChild(list);
      root.appendChild(card);
    }

    return root;
  }

  function templateCard(tpl) {
    const isStrength = tpl.type === 'strength';
    const last = isStrength ? S.lastWorkoutByTemplate(tpl.id) : null;

    const card = h('div', {
      class: 'card',
      style: 'cursor:pointer;position:relative;overflow:hidden',
      onclick: () => global.LJ.startWorkout(tpl.id),
    });

    // 左侧色条
    const colorMap = { brand: 'var(--brand)', blue: 'var(--accent)', warn: 'var(--warn)' };
    card.appendChild(h('div', {
      style: `position:absolute;left:0;top:0;bottom:0;width:3px;background:${colorMap[tpl.color] || 'var(--brand)'}`,
    }));

    const head = h('div', { class: 'flex between items-center', style: 'margin-bottom:10px' });
    head.appendChild(h('div', {}, [
      h('div', { style: 'font-size:17px;font-weight:750;letter-spacing:-.01em' }, tpl.name),
      h('div', { class: 'muted', style: 'font-size:12.5px;margin-top:2px' }, tpl.focus || ''),
    ]));
    head.appendChild(h('span', {
      class: 'chip ' + (isStrength ? 'chip-accent' : 'chip-blue'),
    }, isStrength ? `${tpl.exercises.length} 个动作` : '有氧'));
    card.appendChild(head);

    if (isStrength && tpl.exercises.length) {
      const exList = h('div', { style: 'display:flex;flex-wrap:wrap;gap:6px' });
      tpl.exercises.slice(0, 4).forEach((ex) => {
        exList.appendChild(h('span', {
          style: 'font-size:11.5px;color:var(--text-2);background:var(--bg-elev-2);padding:4px 8px;border-radius:7px',
        }, `${ex.name} ${ex.sets}×${ex.reps}`));
      });
      if (tpl.exercises.length > 4) {
        exList.appendChild(h('span', {
          style: 'font-size:11.5px;color:var(--text-3);padding:4px 4px',
        }, `+${tpl.exercises.length - 4}`));
      }
      card.appendChild(exList);
    }

    if (last) {
      card.appendChild(h('div', {
        class: 'muted',
        style: 'font-size:11.5px;margin-top:10px;padding-top:9px;border-top:1px solid var(--line-soft)',
      }, `上次：${relativeDay(last.date)}`));
    }

    return card;
  }

  /* ==========================================================================
     视图：数据
     ========================================================================== */
  function renderStats() {
    const root = h('div', {});
    const db = S.getDB();
    const week = S.statsForWeek();
    const allW = db.workouts;

    root.appendChild(h('div', {
      style: 'font-size:22px;font-weight:800;letter-spacing:-.02em;margin:2px 2px 14px',
    }, '数据分析'));

    if (!allW.length) {
      root.appendChild(emptyState('还没有数据', '完成第一次训练后，这里会显示训练量、力量和频率趋势。'));
      return root;
    }

    /* 总览 */
    const totalVol = allW.reduce((a, w) => a + S.volumeOf(w), 0);
    const totalSets = allW.filter((w) => w.type === 'strength')
      .reduce((a, w) => a + (w.exercises || []).reduce((b, ex) => b + (ex.sets || []).filter((s) => s.done).length, 0), 0);

    root.appendChild(h('div', { class: 'stat-row' }, [
      h('div', { class: 'stat' }, [
        h('div', { class: 'stat-num' }, String(allW.length)),
        h('div', { class: 'stat-label' }, '总训练次数'),
      ]),
      h('div', { class: 'stat' }, [
        h('div', { class: 'stat-num' }, String(totalSets)),
        h('div', { class: 'stat-label' }, '总完成组数'),
      ]),
      h('div', { class: 'stat' }, [
        h('div', { class: 'stat-num', style: 'font-size:19px' }, volumeText(totalVol)),
        h('div', { class: 'stat-label' }, '累计容量 kg'),
      ]),
    ]));

    /* 近 8 周训练次数 */
    const weeks = [];
    for (let i = 7; i >= 0; i--) {
      const ws = S.addDays(S.weekStart(S.todayStr()), -7 * i);
      const st = S.statsForWeek(ws);
      const d = S.parseDate(ws);
      weeks.push({
        label: `${d.getMonth() + 1}/${d.getDate()}`,
        value: st.count,
      });
    }
    const weekCard = h('div', { class: 'card' });
    weekCard.appendChild(h('div', { class: 'card-head' }, [
      h('div', { class: 'card-title' }, '近 8 周训练频率'),
    ]));
    weekCard.appendChild(C.barChart(weeks, { height: 145 }));
    root.appendChild(weekCard);

    /* 近 8 周训练容量 */
    const volWeeks = [];
    for (let i = 7; i >= 0; i--) {
      const ws = S.addDays(S.weekStart(S.todayStr()), -7 * i);
      const st = S.statsForWeek(ws);
      const d = S.parseDate(ws);
      volWeeks.push({
        label: `${d.getMonth() + 1}/${d.getDate()}`,
        value: Math.round(st.volume / 100) / 10, // 单位：百 kg
      });
    }
    const volCard = h('div', { class: 'card' });
    volCard.appendChild(h('div', { class: 'card-head' }, [
      h('div', { class: 'card-title' }, '近 8 周容量（×100kg）'),
    ]));
    volCard.appendChild(C.barChart(volWeeks, { height: 145, color: 'var(--accent)' }));
    root.appendChild(volCard);

    /* 单动作力量趋势 */
    const exNames = S.allExerciseNames().filter((n) => S.exerciseHistory(n).length >= 2);
    if (exNames.length) {
      const card = h('div', { class: 'card' });
      card.appendChild(h('div', { class: 'card-head' }, [
        h('div', { class: 'card-title' }, '动作力量趋势'),
      ]));

      const select = h('select', { class: 'select', style: 'margin-bottom:12px' });
      exNames.forEach((n) => select.appendChild(h('option', { value: n }, n)));
      card.appendChild(select);

      const chartBox = h('div', {});
      card.appendChild(chartBox);

      const pbBox = h('div', { class: 'flex between mt12', style: 'padding-top:12px;border-top:1px solid var(--line-soft)' });
      card.appendChild(pbBox);

      const draw = () => {
        const name = select.value;
        chartBox.innerHTML = '';
        const hist = S.exerciseHistory(name);
        chartBox.appendChild(C.lineChart(hist, { height: 165 }));
        const pb = S.personalBest(name);
        pbBox.innerHTML = '';
        if (pb) {
          pbBox.appendChild(h('div', {}, [
            h('div', { class: 'muted', style: 'font-size:11.5px' }, '个人最佳'),
            h('div', { style: 'font-size:16px;font-weight:800;margin-top:2px' }, `${pb.weight}kg × ${pb.reps}`),
          ]));
          pbBox.appendChild(h('div', { style: 'text-align:right' }, [
            h('div', { class: 'muted', style: 'font-size:11.5px' }, '达成日期'),
            h('div', { style: 'font-size:13.5px;font-weight:600;margin-top:2px' }, pb.date),
          ]));
        }
      };
      select.addEventListener('change', draw);
      root.appendChild(card);
      // 同步绘制（DOM 已就绪），避免切视图时图表空白
      draw();
    }

    /* 个人最佳榜 */
    const pbs = S.allExerciseNames()
      .map((n) => ({ name: n, pb: S.personalBest(n) }))
      .filter((x) => x.pb)
      .sort((a, b) => b.pb.weight - a.pb.weight)
      .slice(0, 6);
    if (pbs.length) {
      const card = h('div', { class: 'card' });
      card.appendChild(h('div', { class: 'card-head' }, [
        h('div', { class: 'card-title' }, '个人最佳'),
      ]));
      const list = h('div', { class: 'list' });
      pbs.forEach((x) => {
        list.appendChild(h('div', { class: 'row' }, [
          h('div', { class: 'row-main' }, [
            h('div', { class: 'row-title', style: 'font-size:14.5px' }, x.name),
            h('div', { class: 'row-sub' }, x.pb.date),
          ]),
          h('div', { class: 'row-val' }, `${x.pb.weight}kg × ${x.pb.reps}`),
        ]));
      });
      card.appendChild(list);
      root.appendChild(card);
    }

    return root;
  }

  /* ==========================================================================
     视图：日历
     ========================================================================== */
  let calMonth = null; // {y, m}

  function renderCalendar() {
    if (!calMonth) {
      const t = new Date();
      calMonth = { y: t.getFullYear(), m: t.getMonth() };
    }
    const root = h('div', {});
    const db = S.getDB();
    const today = S.todayStr();

    /* 月份切换头 */
    const head = h('div', {
      style: 'display:flex;align-items:center;justify-content:space-between;margin:2px 2px 14px',
    }, [
      h('div', { style: 'font-size:22px;font-weight:800;letter-spacing:-.02em' },
        `${calMonth.y}年${calMonth.m + 1}月`),
      h('div', { class: 'flex gap6' }, [
        h('button', {
          class: 'icon-btn', 'aria-label': '上个月',
          onclick: () => { calMonth.m--; if (calMonth.m < 0) { calMonth.m = 11; calMonth.y--; } global.LJ.rerender(); },
        }, [iconChevron('left')]),
        h('button', {
          class: 'icon-btn', 'aria-label': '下个月',
          onclick: () => { calMonth.m++; if (calMonth.m > 11) { calMonth.m = 0; calMonth.y++; } global.LJ.rerender(); },
        }, [iconChevron('right')]),
      ]),
    ]);
    root.appendChild(head);

    /* 训练日映射 */
    const byDate = new Map();
    db.workouts.forEach((w) => {
      if (!byDate.has(w.date)) byDate.set(w.date, []);
      byDate.get(w.date).push(w);
    });

    /* 日历网格 */
    const card = h('div', { class: 'card', style: 'padding:14px 10px' });

    const wdRow = h('div', {
      style: 'display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:8px',
    });
    ['一', '二', '三', '四', '五', '六', '日'].forEach((d) => {
      wdRow.appendChild(h('div', {
        style: 'text-align:center;font-size:11px;font-weight:600;color:var(--text-3);padding:4px 0',
      }, d));
    });
    card.appendChild(wdRow);

    const grid = h('div', {
      style: 'display:grid;grid-template-columns:repeat(7,1fr);gap:3px',
    });

    const first = new Date(calMonth.y, calMonth.m, 1);
    const daysInMonth = new Date(calMonth.y, calMonth.m + 1, 0).getDate();
    const startOffset = (first.getDay() + 6) % 7;

    for (let i = 0; i < startOffset; i++) grid.appendChild(h('div', {}));

    for (let d = 1; d <= daysInMonth; d++) {
      const ds = S.dateStr(new Date(calMonth.y, calMonth.m, d));
      const ws = byDate.get(ds) || [];
      const plan = S.getPlan(ds);
      const isToday = ds === today;
      const hasStrength = ws.some((w) => w.type === 'strength');
      const hasCardio = ws.some((w) => w.type === 'cardio');
      const isRest = plan && plan.rest;
      const isFuture = ds > today;

      const cell = h('button', {
        style: `
          aspect-ratio:1;min-height:40px;border-radius:10px;display:flex;flex-direction:column;
          align-items:center;justify-content:center;gap:3px;position:relative;
          background:${ws.length ? 'var(--bg-elev-2)' : 'transparent'};
          border:1px solid ${isToday ? 'var(--brand)' : 'transparent'};
          color:${isToday ? 'var(--brand)' : isFuture ? 'var(--text-3)' : 'var(--text)'};
          font-size:13.5px;font-weight:${ws.length ? '700' : '500'};
          transition:transform .12s;
        `,
        onclick: () => global.LJ.openDay(ds),
      }, [
        h('span', {}, String(d)),
        (hasStrength || hasCardio || isRest)
          ? h('div', { style: 'display:flex;gap:2.5px;height:4px' }, [
              hasStrength ? h('span', { style: 'width:4px;height:4px;border-radius:50%;background:var(--brand)' }) : null,
              hasCardio ? h('span', { style: 'width:4px;height:4px;border-radius:50%;background:var(--accent)' }) : null,
              isRest && !ws.length ? h('span', { style: 'width:4px;height:4px;border-radius:50%;background:var(--text-3)' }) : null,
            ].filter(Boolean))
          : h('div', { style: 'height:4px' }),
      ]);
      grid.appendChild(cell);
    }
    card.appendChild(grid);
    root.appendChild(card);

    /* 图例 */
    root.appendChild(h('div', {
      class: 'flex gap10',
      style: 'justify-content:center;margin:-4px 0 14px;font-size:11.5px;color:var(--text-3)',
    }, [
      h('span', { class: 'flex items-center gap6' }, [
        h('span', { style: 'width:6px;height:6px;border-radius:50%;background:var(--brand)' }), '力量',
      ]),
      h('span', { class: 'flex items-center gap6' }, [
        h('span', { style: 'width:6px;height:6px;border-radius:50%;background:var(--accent)' }), '有氧',
      ]),
      h('span', { class: 'flex items-center gap6' }, [
        h('span', { style: 'width:6px;height:6px;border-radius:50%;background:var(--text-3)' }), '休息',
      ]),
    ]));

    /* 本月统计 */
    const monthPrefix = `${calMonth.y}-${String(calMonth.m + 1).padStart(2, '0')}`;
    const monthWorkouts = db.workouts.filter((w) => w.date.startsWith(monthPrefix));
    const monthVol = monthWorkouts.reduce((a, w) => a + S.volumeOf(w), 0);
    root.appendChild(h('div', { class: 'stat-row' }, [
      h('div', { class: 'stat' }, [
        h('div', { class: 'stat-num' }, String(monthWorkouts.length)),
        h('div', { class: 'stat-label' }, '本月训练'),
      ]),
      h('div', { class: 'stat' }, [
        h('div', { class: 'stat-num', style: 'font-size:19px' }, volumeText(monthVol)),
        h('div', { class: 'stat-label' }, '本月容量 kg'),
      ]),
      h('div', { class: 'stat' }, [
        h('div', { class: 'stat-num' }, String(S.streakWeeks())),
        h('div', { class: 'stat-label' }, '连续周数'),
      ]),
    ]));

    return root;
  }

  function iconChevron(dir) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '18');
    svg.setAttribute('height', '18');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2.2');
    svg.setAttribute('stroke-linecap', 'round');
    const p = svgPath(dir === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7');
    svg.appendChild(p);
    return svg;
  }

  /* ==========================================================================
     视图：我的
     ========================================================================== */
  function renderMe() {
    const root = h('div', {});
    const db = S.getDB();
    const settings = S.getSettings();

    root.appendChild(h('div', {
      style: 'font-size:22px;font-weight:800;letter-spacing:-.02em;margin:2px 2px 14px',
    }, '我的'));

    /* 身体数据卡片 */
    const bodyCard = h('div', { class: 'card' });
    bodyCard.appendChild(h('div', { class: 'card-head' }, [
      h('div', { class: 'card-title' }, '身体数据'),
      h('button', { class: 'btn btn-xs btn-ghost', onclick: () => global.LJ.openBodySheet() }, '+ 记录'),
    ]));

    const latest = db.body.length ? db.body[db.body.length - 1] : null;
    if (latest) {
      const wSeries = S.bodySeries('weight');
      let delta = null;
      if (wSeries.length >= 2) {
        delta = S.round(wSeries[wSeries.length - 1].value - wSeries[0].value, 1);
      }
      const top = h('div', { class: 'flex between items-center', style: 'margin-bottom:12px' });
      top.appendChild(h('div', {}, [
        h('div', { class: 'flex', style: 'align-items:baseline;gap:5px' }, [
          h('span', { style: 'font-size:30px;font-weight:800;letter-spacing:-.03em' },
            latest.weight ? latest.weight.toFixed(1) : '--'),
          h('span', { class: 'muted', style: 'font-size:13px;font-weight:600' }, 'kg'),
        ]),
        h('div', { class: 'muted', style: 'font-size:12px;margin-top:1px' }, relativeDay(latest.date)),
      ]));
      if (delta !== null) {
        top.appendChild(h('span', {
          class: 'chip ' + (delta <= 0 ? 'chip-accent' : 'chip-warn'),
        }, `${delta > 0 ? '+' : ''}${delta} kg`));
      }
      bodyCard.appendChild(top);

      if (wSeries.length >= 2) {
        bodyCard.appendChild(C.lineChart(wSeries, { height: 150, color: 'var(--accent)' }));
      }

      // 围度
      const dims = [
        ['waist', '腰围'], ['chest', '胸围'], ['hip', '臀围'], ['arm', '臂围'], ['thigh', '腿围'],
      ].filter(([k]) => latest[k]);
      if (dims.length) {
        const dimRow = h('div', {
          style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(70px,1fr));gap:8px;margin-top:12px;padding-top:12px;border-top:1px solid var(--line-soft)',
        });
        dims.forEach(([k, label]) => {
          dimRow.appendChild(h('div', { style: 'text-align:center' }, [
            h('div', { style: 'font-size:15px;font-weight:750' }, latest[k] + ''),
            h('div', { class: 'muted', style: 'font-size:11px;margin-top:1px' }, label),
          ]));
        });
        bodyCard.appendChild(dimRow);
      }

      bodyCard.appendChild(h('button', {
        class: 'btn btn-ghost btn-block btn-sm', style: 'margin-top:14px',
        onclick: () => global.LJ.openBodyHistory(),
      }, '查看历史记录'));
    } else {
      bodyCard.appendChild(h('div', {
        class: 'muted', style: 'font-size:13px;line-height:1.6;padding:6px 0 4px',
      }, '还没有身体数据。不需要每天称重，一周记 1–2 次就够看出趋势。'));
    }
    root.appendChild(bodyCard);

    /* 设置 */
    const setCard = h('div', { class: 'card' });
    setCard.appendChild(h('div', { class: 'card-head' }, [
      h('div', { class: 'card-title' }, '训练设置'),
    ]));
    const setList = h('div', { class: 'list' });

    // 周目标
    setList.appendChild(h('div', { class: 'row' }, [
      h('div', { class: 'row-main' }, [
        h('div', { class: 'row-title' }, '每周训练目标'),
        h('div', { class: 'row-sub' }, '影响首页进度环'),
      ]),
      h('select', {
        class: 'select', style: 'width:84px;padding:8px 30px 8px 12px;font-size:14px',
        onchange: (e) => { S.setSetting('weeklyGoal', Number(e.target.value)); global.LJ.rerender(); },
      }, [2, 3, 4, 5, 6, 7].map((n) =>
        h('option', { value: n, selected: settings.weeklyGoal === n ? 'selected' : null }, n + ' 次')
      )),
    ]));

    // 默认休息时间
    setList.appendChild(h('div', { class: 'row' }, [
      h('div', { class: 'row-main' }, [
        h('div', { class: 'row-title' }, '默认组间休息'),
        h('div', { class: 'row-sub' }, '新动作默认使用'),
      ]),
      h('select', {
        class: 'select', style: 'width:96px;padding:8px 30px 8px 12px;font-size:14px',
        onchange: (e) => { S.setSetting('defaultRest', Number(e.target.value)); global.LJ.rerender(); },
      }, [45, 60, 90, 120, 150, 180].map((n) =>
        h('option', { value: n, selected: settings.defaultRest === n ? 'selected' : null }, n + ' 秒')
      )),
    ]));

    // RPE
    setList.appendChild(h('div', { class: 'row' }, [
      h('div', { class: 'row-main' }, [
        h('div', { class: 'row-title' }, '记录 RPE 强度'),
        h('div', { class: 'row-sub' }, '主观用力程度 1–10，可选'),
      ]),
      h('button', {
        class: 'chip ' + (settings.rpeEnabled ? 'chip-accent' : ''),
        style: 'cursor:pointer',
        onclick: () => { S.setSetting('rpeEnabled', !settings.rpeEnabled); global.LJ.rerender(); },
      }, settings.rpeEnabled ? '已开启' : '已关闭'),
    ]));

    setCard.appendChild(setList);
    root.appendChild(setCard);

    /* 数据管理 */
    const dataCard = h('div', { class: 'card' });
    dataCard.appendChild(h('div', { class: 'card-head' }, [
      h('div', { class: 'card-title' }, '数据管理'),
    ]));
    const dataList = h('div', { class: 'list' });

    dataList.appendChild(h('div', {
      class: 'row', style: 'cursor:pointer', onclick: () => global.LJ.exportBackup(),
    }, [
      h('div', { class: 'row-main' }, [
        h('div', { class: 'row-title' }, '导出备份（JSON）'),
        h('div', { class: 'row-sub' }, '包含全部训练、身体数据与设置'),
      ]),
      h('span', { class: 'muted' }, '→'),
    ]));

    dataList.appendChild(h('div', {
      class: 'row', style: 'cursor:pointer', onclick: () => global.LJ.importBackup(),
    }, [
      h('div', { class: 'row-main' }, [
        h('div', { class: 'row-title' }, '从备份恢复'),
        h('div', { class: 'row-sub' }, '支持覆盖或合并'),
      ]),
      h('span', { class: 'muted' }, '→'),
    ]));

    dataList.appendChild(h('div', {
      class: 'row', style: 'cursor:pointer', onclick: () => global.LJ.exportCSV(),
    }, [
      h('div', { class: 'row-main' }, [
        h('div', { class: 'row-title' }, '导出训练 CSV'),
        h('div', { class: 'row-sub' }, '可用 Excel 打开分析'),
      ]),
      h('span', { class: 'muted' }, '→'),
    ]));

    dataList.appendChild(h('div', {
      class: 'row', style: 'cursor:pointer', onclick: () => global.LJ.exportBodyCSV(),
    }, [
      h('div', { class: 'row-main' }, [
        h('div', { class: 'row-title' }, '导出身体数据 CSV'),
      ]),
      h('span', { class: 'muted' }, '→'),
    ]));

    dataCard.appendChild(dataList);
    root.appendChild(dataCard);

    /* 存储信息 */
    const infoCard = h('div', { class: 'card' });
    infoCard.appendChild(h('div', { class: 'card-head' }, [
      h('div', { class: 'card-title' }, '存储与关于'),
    ]));
    const bytes = new Blob([JSON.stringify(db)]).size;
    const infoList = h('div', { class: 'list' });
    infoList.appendChild(h('div', { class: 'row' }, [
      h('div', { class: 'row-main' }, [h('div', { class: 'row-title' }, '数据占用')]),
      h('div', { class: 'row-val', style: 'font-size:13.5px' }, (bytes / 1024).toFixed(1) + ' KB'),
    ]));
    infoList.appendChild(h('div', { class: 'row' }, [
      h('div', { class: 'row-main' }, [h('div', { class: 'row-title' }, '训练记录')]),
      h('div', { class: 'row-val', style: 'font-size:13.5px' }, db.workouts.length + ' 条'),
    ]));
    infoList.appendChild(h('div', { class: 'row' }, [
      h('div', { class: 'row-main' }, [h('div', { class: 'row-title' }, '身体记录')]),
      h('div', { class: 'row-val', style: 'font-size:13.5px' }, db.body.length + ' 条'),
    ]));
    infoCard.appendChild(infoList);
    infoCard.appendChild(h('div', {
      class: 'muted',
      style: 'font-size:11.5px;line-height:1.6;margin-top:12px;padding-top:12px;border-top:1px solid var(--line-soft)',
    }, '练迹 v1.0 · 所有数据保存在本机浏览器，不上传任何服务器。清除浏览器数据会导致记录丢失，建议定期导出备份。'));
    root.appendChild(infoCard);

    /* 危险操作 */
    const dangerCard = h('div', { class: 'card' });
    dangerCard.appendChild(h('button', {
      class: 'btn btn-danger btn-block',
      onclick: () => global.LJ.confirmReset(),
    }, '清空全部数据'));
    root.appendChild(dangerCard);

    return root;
  }

  /* ==========================================================================
     导出
     ========================================================================== */
  global.LJViews = {
    h, $, $$, esc, fmtDateCN, relativeDay, volumeText, emptyState, iconChevron, svgPath, workoutRow,
    renderToday, renderTrain, renderStats, renderCalendar, renderMe,
    get calMonth() { return calMonth; },
  };
})(window);
