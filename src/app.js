/* ==========================================================================
   练迹 · 应用主逻辑
   ========================================================================== */
(function (global) {
  'use strict';

  const S = global.LJStore;
  const V = global.LJViews;
  const h = V.h;
  const $ = V.$;

  /* ---------------- 全局状态 ---------------- */
  const state = {
    tab: 'today',
    editor: null,     // 当前编辑中的训练 draft
    editingId: null,  // 正在编辑的记录 id（null 表示新建）
  };

  /* ---------------- 主题 ---------------- */
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'dark' ? '#0B0D0F' : '#F4F6F8');
  }

  function initTheme() {
    const saved = S.getSettings().theme || 'dark';
    applyTheme(saved);
  }

  function toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    S.setSetting('theme', next);
    toast(next === 'dark' ? '已切换深色' : '已切换浅色');
  }

  /* ---------------- Toast ---------------- */
  let toastTimer = null;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 1900);
  }
  global.LJ = global.LJ || {};
  global.LJ.toast = toast;

  /* ---------------- 弹层 ---------------- */
  function openSheet(content, opts = {}) {
    const mask = $('#sheet-mask');
    const sheet = $('#sheet');
    sheet.innerHTML = '';
    if (opts.grip !== false) sheet.appendChild(h('div', { class: 'sheet-grip' }));
    sheet.appendChild(content);
    mask.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeSheet() {
    const mask = $('#sheet-mask');
    mask.hidden = true;
    $('#sheet').innerHTML = '';
    document.body.style.overflow = '';
  }

  $('#sheet-mask').addEventListener('click', (e) => {
    if (e.target.id === 'sheet-mask') closeSheet();
  });

  /* ---------------- 渲染路由 ---------------- */
  function go(tab) {
    state.tab = tab;
    render();
  }
  global.LJ.go = go;
  global.LJ.rerender = render;

  function render() {
    const view = $('#view');
    view.innerHTML = '';
    let node;
    switch (state.tab) {
      case 'today': node = V.renderToday(); break;
      case 'train': node = V.renderTrain(); break;
      case 'stats': node = V.renderStats(); break;
      case 'calendar': node = V.renderCalendar(); break;
      case 'me': node = V.renderMe(); break;
      default: node = V.renderToday();
    }
    view.appendChild(node);

    // 导航高亮
    V.$$('.tab').forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === state.tab);
    });
    // 回顶
    window.scrollTo(0, 0);
  }

  /* ==========================================================================
     训练编辑（核心）
     ========================================================================== */
  function startWorkout(templateId) {
    const tpl = templateId ? S.getTemplate(templateId) : null;
    const today = S.todayStr();
    const defaultRest = S.getSettings().defaultRest || 90;

    let draft;
    if (tpl && tpl.type === 'cardio') {
      draft = {
        type: 'cardio',
        date: today,
        name: tpl.name,
        templateId: tpl.id,
        cardio: { kind: tpl.name.replace(/\s*·.*/, ''), duration: '', distance: '', avgHr: '', feel: '' },
        note: '',
      };
    } else {
      const exercises = tpl
        ? tpl.exercises.map((ex) => {
            const last = S.lastExerciseData(ex.name);
            const sets = [];
            const n = ex.sets || 3;
            for (let i = 0; i < n; i++) {
              const prev = last && last.sets[i];
              sets.push({
                weight: prev ? prev.weight : (ex.weight || ''),
                reps: prev ? prev.reps : (ex.reps || ''),
                done: false,
                rpe: null,
                // preset：模板/历史预填值，未经用户确认，不参与统计
                preset: true,
              });
            }
            return {
              id: S.uid(),
              name: ex.name,
              part: ex.part || '',
              sets,
              rest: ex.rest || defaultRest,
              note: '',
            };
          })
        : [];

      draft = {
        type: 'strength',
        date: today,
        name: tpl ? tpl.name : '自由训练',
        templateId: tpl ? tpl.id : null,
        exercises,
        note: '',
      };
    }

    state.editor = draft;
    state.editingId = null;
    renderEditor();
  }
  global.LJ.startWorkout = startWorkout;

  function openWorkout(id) {
    const w = S.getWorkout(id);
    if (!w) return;
    // 深拷贝，编辑时不影响原数据
    state.editor = JSON.parse(JSON.stringify(w));
    state.editingId = id;
    renderEditor();
  }
  global.LJ.openWorkout = openWorkout;

  function renderEditor() {
    const d = state.editor;
    const view = $('#view');
    view.innerHTML = '';

    const root = h('div', {});

    /* 顶部操作条 */
    const head = h('div', {
      style: 'display:flex;align-items:center;gap:10px;margin:0 0 16px',
    }, [
      h('button', {
        class: 'icon-btn', 'aria-label': '返回',
        onclick: () => { cancelEditor(); },
      }, [V.iconChevron('left')]),
      h('div', { class: 'grow' }, [
        h('div', { style: 'font-size:18px;font-weight:800;letter-spacing:-.01em' },
          state.editingId ? '编辑训练' : (d.type === 'cardio' ? '记录有氧' : '训练中')),
        h('div', { class: 'muted', style: 'font-size:12px;margin-top:1px' },
          V.relativeDay(d.date) + ' · ' + (d.name || '')),
      ]),
      h('button', {
        class: 'btn btn-accent btn-sm',
        onclick: () => saveEditor(),
      }, '保存'),
    ]);
    root.appendChild(head);

    if (d.type === 'cardio') {
      root.appendChild(renderCardioForm(d));
    } else {
      root.appendChild(renderStrengthForm(d));
    }

    view.appendChild(root);
    window.scrollTo(0, 0);
  }

  /* ---------- 力量表单 ---------- */
  function renderStrengthForm(d) {
    const wrap = h('div', {});
    const rpeOn = S.getSettings().rpeEnabled;

    /* 动作列表 */
    if (!d.exercises.length) {
      wrap.appendChild(V.emptyState(
        '还没有动作',
        '添加一个动作开始记录。重量和次数会从上次训练自动带入。'
      ));
    }

    d.exercises.forEach((ex, exIdx) => {
      const card = h('div', { class: 'card', style: 'padding:14px' });

      /* 动作头 */
      const exHead = h('div', { class: 'flex between items-center', style: 'margin-bottom:12px' });
      exHead.appendChild(h('div', { class: 'grow' }, [
        h('div', { style: 'font-size:16px;font-weight:750;letter-spacing:-.01em' }, ex.name),
        h('div', { class: 'muted', style: 'font-size:11.5px;margin-top:1px' },
          [ex.part, `${ex.sets.length} 组`].filter(Boolean).join(' · ')),
      ]));

      // 更多操作
      const menuBtn = h('button', {
        class: 'icon-btn', style: 'width:32px;height:32px;border-radius:9px',
        'aria-label': '动作选项',
        onclick: () => openExerciseMenu(exIdx),
      }, [V.svgPath ? (() => {
        const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        s.setAttribute('viewBox', '0 0 24 24');
        s.setAttribute('width', '16'); s.setAttribute('height', '16');
        s.setAttribute('fill', 'currentColor');
        ['6', '12', '18'].forEach((cy) => {
          const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          c.setAttribute('cx', '12'); c.setAttribute('cy', cy); c.setAttribute('r', '1.7');
          s.appendChild(c);
        });
        return s;
      })() : null]);
      exHead.appendChild(menuBtn);
      card.appendChild(exHead);

      /* 组表头 */
      const headerRow = h('div', {
        style: 'display:grid;grid-template-columns:30px 1fr 1fr ' + (rpeOn ? '46px ' : '') + '46px;gap:7px;margin-bottom:7px;padding:0 1px',
      }, [
        h('div', { style: 'font-size:10.5px;color:var(--text-3);text-align:center;font-weight:600' }, '组'),
        h('div', { style: 'font-size:10.5px;color:var(--text-3);text-align:center;font-weight:600' }, '重量 kg'),
        h('div', { style: 'font-size:10.5px;color:var(--text-3);text-align:center;font-weight:600' }, '次数'),
        rpeOn ? h('div', { style: 'font-size:10.5px;color:var(--text-3);text-align:center;font-weight:600' }, 'RPE') : null,
        h('div', { style: 'font-size:10.5px;color:var(--text-3);text-align:center;font-weight:600' }, '完成'),
      ].filter(Boolean));
      card.appendChild(headerRow);

      /* 组行 */
      ex.sets.forEach((set, si) => {
        card.appendChild(renderSetRow(d, ex, set, si, exIdx, rpeOn));
      });

      /* 底部：加组 / 复制上次 / 休息设置 */
      const foot = h('div', { class: 'flex gap6', style: 'margin-top:10px' });
      foot.appendChild(h('button', {
        class: 'btn btn-xs btn-ghost grow',
        onclick: () => {
          const last = ex.sets[ex.sets.length - 1];
          ex.sets.push({
            weight: last ? last.weight : '',
            reps: last ? last.reps : '',
            done: false, rpe: null,
          });
          renderEditor();
        },
      }, '+ 加一组'));

      foot.appendChild(h('button', {
        class: 'btn btn-xs btn-ghost grow',
        onclick: () => {
          const last = S.lastExerciseData(ex.name, state.editingId);
          if (!last) { toast('没有找到该动作的历史记录'); return; }
          // 用上次数据填充，保持组数一致
          ex.sets = last.sets.map((s) => ({ weight: s.weight, reps: s.reps, done: false, rpe: null }));
          renderEditor();
          toast(`已带入 ${last.date} 的数据`);
        },
      }, '带入上次'));

      foot.appendChild(h('button', {
        class: 'btn btn-xs btn-ghost',
        onclick: () => {
          openRestPicker(ex);
        },
      }, `休息 ${ex.rest}s`));
      card.appendChild(foot);

      /* 动作备注 */
      const noteInput = h('input', {
        class: 'input', type: 'text', placeholder: '动作备注（选填）',
        value: ex.note || '',
        style: 'margin-top:10px;padding:9px 12px;font-size:13.5px',
        oninput: (e) => { ex.note = e.target.value; },
      });
      card.appendChild(noteInput);

      wrap.appendChild(card);
    });

    /* 添加动作 */
    wrap.appendChild(h('button', {
      class: 'btn btn-primary btn-block', style: 'margin-bottom:12px',
      onclick: () => openAddExercise(),
    }, '+ 添加动作'));

    /* 整场备注 */
    const noteCard = h('div', { class: 'card' });
    noteCard.appendChild(h('label', { class: 'field-label' }, '训练备注'));
    noteCard.appendChild(h('textarea', {
      class: 'textarea', placeholder: '今天状态如何？哪里不舒服？',
      oninput: (e) => { d.note = e.target.value; },
    }, d.note || ''));
    wrap.appendChild(noteCard);

    /* 实时统计 */
    const stat = computeDraftStats(d);
    wrap.appendChild(h('div', { class: 'stat-row', style: 'margin-bottom:12px' }, [
      h('div', { class: 'stat' }, [
        h('div', { class: 'stat-num' }, String(stat.sets)),
        h('div', { class: 'stat-label' }, '已完成组'),
      ]),
      h('div', { class: 'stat' }, [
        h('div', { class: 'stat-num', style: 'font-size:19px' }, V.volumeText(stat.volume)),
        h('div', { class: 'stat-label' }, '训练容量 kg'),
      ]),
      h('div', { class: 'stat' }, [
        h('div', { class: 'stat-num', style: 'font-size:19px' }, String(stat.exCount)),
        h('div', { class: 'stat-label' }, '动作数'),
      ]),
    ]));

    return wrap;
  }

  function renderSetRow(d, ex, set, si, exIdx, rpeOn) {
    const row = h('div', {
      style: `display:grid;grid-template-columns:30px 1fr 1fr ${rpeOn ? '46px ' : ''}46px;gap:7px;align-items:center;margin-bottom:6px`,
    });

    // 组号
    row.appendChild(h('div', {
      style: `text-align:center;font-size:13px;font-weight:700;font-variant-numeric:tabular-nums;
        color:${set.done ? 'var(--brand)' : 'var(--text-3)'}`,
    }, String(si + 1)));

    // 重量
    const wInput = h('input', {
      class: 'input input-num', type: 'number', inputmode: 'decimal', step: '0.5',
      min: '0', placeholder: '0', value: set.weight === '' || set.weight == null ? '' : set.weight,
      style: `padding:11px 4px;font-size:16px;${
        set.done ? 'border-color:rgba(200,255,61,.45);background:rgba(200,255,61,.05)'
        : set.preset ? 'color:var(--text-3)' : ''}`,
      oninput: (e) => {
        set.weight = e.target.value === '' ? '' : Number(e.target.value);
        set.preset = false;
        e.target.style.color = '';
      },
    });
    row.appendChild(wInput);

    // 次数
    const rInput = h('input', {
      class: 'input input-num', type: 'number', inputmode: 'numeric', step: '1',
      min: '0', placeholder: '0', value: set.reps === '' || set.reps == null ? '' : set.reps,
      style: `padding:11px 4px;font-size:16px;${
        set.done ? 'border-color:rgba(200,255,61,.45);background:rgba(200,255,61,.05)'
        : set.preset ? 'color:var(--text-3)' : ''}`,
      oninput: (e) => {
        set.reps = e.target.value === '' ? '' : Number(e.target.value);
        set.preset = false;
        e.target.style.color = '';
      },
    });
    row.appendChild(rInput);

    // RPE
    if (rpeOn) {
      row.appendChild(h('input', {
        class: 'input input-num', type: 'number', inputmode: 'numeric',
        min: '1', max: '10', step: '1', placeholder: '—',
        value: set.rpe ?? '',
        style: 'padding:11px 2px;font-size:14px;color:var(--text-2)',
        oninput: (e) => {
          const v = e.target.value === '' ? null : Math.max(1, Math.min(10, Number(e.target.value)));
          set.rpe = v;
        },
      }));
    }

    // 完成按钮
    const doneBtn = h('button', {
      style: `
        height:42px;border-radius:11px;display:grid;place-items:center;
        background:${set.done ? 'var(--brand)' : 'var(--bg-elev-2)'};
        border:1px solid ${set.done ? 'var(--brand)' : 'var(--line)'};
        color:${set.done ? 'var(--brand-ink)' : 'var(--text-3)'};
        transition:all .16s cubic-bezier(.22,.61,.36,1);
      `,
      'aria-label': set.done ? '取消完成' : '标记完成',
      onclick: () => {
        if (!set.done) {
          // 校验：有重量和次数才能完成
          if (!(Number(set.weight) > 0) && !(Number(set.reps) > 0)) {
            toast('先填重量或次数');
            return;
          }
          set.done = true;
          renderEditor();
          startRest(ex.rest || 90);
        } else {
          set.done = false;
          renderEditor();
        }
      },
    }, [(() => {
      const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      s.setAttribute('viewBox', '0 0 24 24');
      s.setAttribute('width', '18'); s.setAttribute('height', '18');
      s.setAttribute('fill', 'none');
      s.setAttribute('stroke', 'currentColor');
      s.setAttribute('stroke-width', '3');
      s.setAttribute('stroke-linecap', 'round');
      s.setAttribute('stroke-linejoin', 'round');
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', 'M4.5 12.5l5 5 10-11');
      s.appendChild(p);
      return s;
    })()]);

    row.appendChild(doneBtn);
    return row;
  }

  function computeDraftStats(d) {
    let sets = 0, volume = 0;
    (d.exercises || []).forEach((ex) => {
      (ex.sets || []).forEach((s) => {
        if (s.done) {
          sets++;
          if (s.weight > 0 && s.reps > 0) volume += s.weight * s.reps;
        }
      });
    });
    return { sets, volume, exCount: (d.exercises || []).length };
  }

  /* ---------- 有氧表单 ---------- */
  function renderCardioForm(d) {
    const wrap = h('div', {});
    const c = d.cardio;

    const kinds = ['跑步', '快走', '椭圆机', '动感单车', '划船机', '跳绳', 'HIIT', 'INS/T25', '游泳', '其他'];
    const card = h('div', { class: 'card' });

    card.appendChild(h('label', { class: 'field-label' }, '训练类型'));
    const kindWrap = h('div', { style: 'display:flex;flex-wrap:wrap;gap:7px;margin-bottom:16px' });
    kinds.forEach((k) => {
      const active = c.kind === k;
      kindWrap.appendChild(h('button', {
        class: 'chip ' + (active ? 'chip-accent' : ''),
        style: 'cursor:pointer;height:32px;padding:0 13px',
        onclick: () => { c.kind = k; d.name = k; renderEditor(); },
      }, k));
    });
    card.appendChild(kindWrap);

    // 时长
    card.appendChild(h('label', { class: 'field-label' }, '时长（分钟）'));
    card.appendChild(h('input', {
      class: 'input', type: 'number', inputmode: 'numeric', min: '0', placeholder: '例如 45',
      value: c.duration ?? '',
      oninput: (e) => { c.duration = e.target.value === '' ? '' : Number(e.target.value); },
    }));

    // 距离
    wrap.appendChild(card);
    const card2 = h('div', { class: 'card' });
    card2.appendChild(h('label', { class: 'field-label' }, '距离（km，选填）'));
    card2.appendChild(h('input', {
      class: 'input', type: 'number', inputmode: 'decimal', step: '0.01', min: '0', placeholder: '例如 5.2',
      value: c.distance ?? '',
      oninput: (e) => { c.distance = e.target.value === '' ? '' : Number(e.target.value); },
    }));

    card2.appendChild(h('label', { class: 'field-label', style: 'margin-top:16px' }, '平均心率（选填）'));
    card2.appendChild(h('input', {
      class: 'input', type: 'number', inputmode: 'numeric', min: '0', max: '250', placeholder: '例如 145',
      value: c.avgHr ?? '',
      oninput: (e) => { c.avgHr = e.target.value === '' ? '' : Number(e.target.value); },
    }));
    wrap.appendChild(card2);

    // 感受
    const card3 = h('div', { class: 'card' });
    card3.appendChild(h('label', { class: 'field-label' }, '主观感受'));
    const feels = [
      ['easy', '轻松', 'var(--accent)'],
      ['moderate', '适中', 'var(--brand)'],
      ['hard', '吃力', 'var(--warn)'],
      ['allout', '力竭', 'var(--danger)'],
    ];
    const feelWrap = h('div', { style: 'display:flex;gap:7px;flex-wrap:wrap;margin-bottom:16px' });
    feels.forEach(([k, label, color]) => {
      const active = c.feel === k;
      feelWrap.appendChild(h('button', {
        class: 'chip',
        style: `cursor:pointer;height:34px;padding:0 15px;${active
          ? `background:${color}22;color:${color};border:1px solid ${color}55`
          : 'border:1px solid var(--line)'}`,
        onclick: () => { c.feel = k; renderEditor(); },
      }, label));
    });
    card3.appendChild(feelWrap);

    card3.appendChild(h('label', { class: 'field-label' }, '备注'));
    card3.appendChild(h('textarea', {
      class: 'textarea', placeholder: '配速、体感、路线…',
      oninput: (e) => { d.note = e.target.value; },
    }, d.note || ''));
    wrap.appendChild(card3);

    return wrap;
  }

  /* ---------- 动作菜单 ---------- */
  function openExerciseMenu(exIdx) {
    const d = state.editor;
    const ex = d.exercises[exIdx];
    const body = h('div', {});
    body.appendChild(h('div', { class: 'sheet-title' }, ex.name));
    body.appendChild(h('div', { class: 'sheet-desc' }, '调整这个动作的设置'));

    const list = h('div', { class: 'list' });
    list.appendChild(h('div', {
      class: 'row', style: 'cursor:pointer',
      onclick: () => {
        closeSheet();
        const input = prompt('修改动作名称', ex.name);
        if (input && input.trim()) { ex.name = input.trim(); renderEditor(); }
      },
    }, [h('div', { class: 'row-main' }, [h('div', { class: 'row-title' }, '重命名')])]));

    list.appendChild(h('div', {
      class: 'row', style: 'cursor:pointer',
      onclick: () => {
        closeSheet();
        if (ex.sets.length <= 1) { toast('至少保留一组'); return; }
        ex.sets.pop();
        renderEditor();
      },
    }, [h('div', { class: 'row-main' }, [h('div', { class: 'row-title' }, '删除最后一组')])]));

    list.appendChild(h('div', {
      class: 'row', style: 'cursor:pointer',
      onclick: () => {
        closeSheet();
        openRestPicker(ex);
      },
    }, [
      h('div', { class: 'row-main' }, [h('div', { class: 'row-title' }, '组间休息时间')]),
      h('span', { class: 'row-val', style: 'font-size:13.5px' }, ex.rest + ' 秒'),
    ]));

    list.appendChild(h('div', {
      class: 'row', style: 'cursor:pointer',
      onclick: () => {
        closeSheet();
        if (exIdx > 0) {
          const tmp = d.exercises[exIdx - 1];
          d.exercises[exIdx - 1] = ex;
          d.exercises[exIdx] = tmp;
          renderEditor();
        }
      },
    }, [h('div', { class: 'row-main' }, [h('div', { class: 'row-title' }, '上移')])]));

    body.appendChild(list);

    body.appendChild(h('div', { class: 'sheet-actions' }, [
      h('button', { class: 'btn btn-ghost', onclick: closeSheet }, '取消'),
      h('button', {
        class: 'btn btn-danger',
        onclick: () => {
          closeSheet();
          confirmDialog(
            '删除动作',
            `确定要从本次训练中移除「${ex.name}」吗？只影响本次记录，不会删除历史数据。`,
            () => {
              d.exercises.splice(exIdx, 1);
              renderEditor();
            }
          );
        },
      }, '删除动作'),
    ]));

    openSheet(body);
  }

  function openRestPicker(ex) {
    const opts = [45, 60, 75, 90, 120, 150, 180, 240];
    const body = h('div', {});
    body.appendChild(h('div', { class: 'sheet-title' }, '组间休息'));
    body.appendChild(h('div', { class: 'sheet-desc' }, '这个动作每完成一组后的倒计时长度'));

    const grid = h('div', { style: 'display:grid;grid-template-columns:repeat(4,1fr);gap:8px' });
    opts.forEach((n) => {
      const active = ex.rest === n;
      grid.appendChild(h('button', {
        style: `
          height:52px;border-radius:13px;font-size:15px;font-weight:700;
          background:${active ? 'var(--brand)' : 'var(--bg-elev-2)'};
          color:${active ? 'var(--brand-ink)' : 'var(--text)'};
          border:1px solid ${active ? 'var(--brand)' : 'var(--line)'};
        `,
        onclick: () => {
          ex.rest = n;
          closeSheet();
          renderEditor();
        },
      }, n + 's'));
    });
    body.appendChild(grid);
    openSheet(body);
  }

  /* ---------- 添加动作 ---------- */
  function openAddExercise() {
    const d = state.editor;
    const body = h('div', {});
    body.appendChild(h('div', { class: 'sheet-title' }, '添加动作'));

    // 搜索/输入
    const input = h('input', {
      class: 'input', type: 'text', placeholder: '输入动作名称，或从下方选择',
      style: 'margin-bottom:12px',
    });
    body.appendChild(input);

    const suggestWrap = h('div', {
      style: 'max-height:46vh;overflow-y:auto;-webkit-overflow-scrolling:touch',
    });

    const names = S.allExerciseNames();
    const renderSuggest = (kw) => {
      suggestWrap.innerHTML = '';
      const filtered = kw
        ? names.filter((n) => n.toLowerCase().includes(kw.toLowerCase()))
        : names;
      const list = h('div', { class: 'list' });
      filtered.slice(0, 40).forEach((n) => {
        const last = S.lastExerciseData(n);
        list.appendChild(h('div', {
          class: 'row', style: 'cursor:pointer',
          onclick: () => {
            addExerciseToDraft(n, last);
            closeSheet();
            renderEditor();
          },
        }, [
          h('div', { class: 'row-main' }, [
            h('div', { class: 'row-title', style: 'font-size:14.5px' }, n),
            last ? h('div', { class: 'row-sub' },
              `上次 ${last.sets.length} 组 · ${last.sets[0].weight}kg × ${last.sets[0].reps}`) : null,
          ].filter(Boolean)),
          h('span', { class: 'muted' }, '+'),
        ]));
      });
      if (!filtered.length) {
        list.appendChild(h('div', {
          class: 'row', style: 'cursor:pointer',
          onclick: () => {
            addExerciseToDraft(input.value.trim(), null);
            closeSheet();
            renderEditor();
          },
        }, [
          h('div', { class: 'row-main' }, [
            h('div', { class: 'row-title' }, `新建「${input.value.trim()}」`),
          ]),
        ]));
      }
      suggestWrap.appendChild(list);
    };

    input.addEventListener('input', () => renderSuggest(input.value.trim()));
    renderSuggest('');

    body.appendChild(suggestWrap);

    body.appendChild(h('div', { class: 'sheet-actions' }, [
      h('button', { class: 'btn btn-ghost', onclick: closeSheet }, '取消'),
      h('button', {
        class: 'btn btn-accent',
        onclick: () => {
          const v = input.value.trim();
          if (!v) { toast('请输入动作名称'); return; }
          addExerciseToDraft(v, S.lastExerciseData(v));
          closeSheet();
          renderEditor();
        },
      }, '添加'),
    ]));

    openSheet(body);
    setTimeout(() => input.focus(), 120);
  }

  function addExerciseToDraft(name, last) {
    const d = state.editor;
    const rest = S.getSettings().defaultRest || 90;
    const sets = [];
    if (last && last.sets.length) {
      last.sets.forEach((s) => sets.push({ weight: s.weight, reps: s.reps, done: false, rpe: null }));
    } else {
      for (let i = 0; i < 3; i++) sets.push({ weight: '', reps: '', done: false, rpe: null });
    }
    d.exercises.push({
      id: S.uid(), name, part: '', sets, rest, note: '',
    });
  }

  /* ---------- 保存 ---------- */
  function saveEditor() {
    const d = state.editor;
    if (!d) return;

    if (d.type === 'strength') {
      // 只保存已完成（勾选✓）的组
      const doneSets = [];
      const pendingSets = [];
      d.exercises.forEach((ex) => {
        (ex.sets || []).forEach((s) => {
          if (s.done) doneSets.push(s);
          else if (Number(s.weight) > 0 || Number(s.reps) > 0) pendingSets.push(s);
        });
      });

      if (!doneSets.length) {
        toast(pendingSets.length ? '请先点✓标记完成的组' : '至少完成一组才能保存');
        return;
      }

      // 有填了但未勾选的组，问一次
      if (pendingSets.length) {
        confirmDialog(
          `还有 ${pendingSets.length} 组未标记完成`,
          '这些组填了重量或次数，但没有点✓。只保存已完成的组？',
          () => finalizeSave(d, true),
          '只存已完成的'
        );
        return;
      }

      finalizeSave(d, false);
      return;
    }

    // 有氧
    const c = d.cardio;
    if (!c.duration && !c.distance) {
      toast('至少填写时长或距离');
      return;
    }
    finalizeSave(d, false);
  }

  /** 真正写入：dropPending=true 时丢弃未完成的组 */
  function finalizeSave(d, dropPending) {
    if (d.type === 'strength') {
      const cleaned = d.exercises
        .map((ex) => ({
          ...ex,
          sets: ex.sets.filter((s) => (dropPending ? s.done : (s.done || Number(s.weight) > 0 || Number(s.reps) > 0))),
        }))
        .filter((ex) => ex.sets.length > 0);

      if (!cleaned.length) {
        toast('没有可保存的组');
        return;
      }
      d.exercises = cleaned;
    }

    if (state.editingId) {
      S.updateWorkout(state.editingId, d);
      toast('已保存修改');
    } else {
      S.addWorkout(d);
      toast('训练已记录 💪');
    }

    state.editor = null;
    state.editingId = null;
    state.tab = 'today';
    render();
  }

  function cancelEditor() {
    const d = state.editor;
    const hasData = d && (
      d.type === 'strength'
        ? d.exercises.some((ex) => ex.sets.some((s) => s.done || Number(s.weight) > 0))
        : (d.cardio.duration || d.cardio.distance)
    );

    if (!hasData) {
      state.editor = null;
      state.editingId = null;
      state.tab = 'today';
      render();
      return;
    }

    confirmDialog(
      '放弃这次训练？',
      state.editingId ? '修改还没保存，返回会丢失。' : '已经填的内容不会保存。',
      () => {
        state.editor = null;
        state.editingId = null;
        state.tab = 'today';
        render();
      },
      '放弃'
    );
  }

  /* ==========================================================================
     组间休息倒计时
     ========================================================================== */
  let restTimer = null;
  let restEnd = 0;
  let restTotal = 0;

  function startRest(seconds) {
    stopRest(true);
    restTotal = seconds;
    restEnd = Date.now() + seconds * 1000;
    const ov = $('#rest-overlay');
    ov.hidden = false;
    tickRest();
    restTimer = setInterval(tickRest, 250);

    // 震动反馈（Android 支持；iOS Safari 不支持 vibrate，静默跳过）
    vibrate(30);
  }

  function tickRest() {
    const left = Math.max(0, restEnd - Date.now());
    const s = Math.ceil(left / 1000);
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    const timeEl = $('#rest-time');
    if (timeEl) timeEl.textContent = `${mm}:${ss}`;
    const bar = $('#rest-bar-fill');
    if (bar) bar.style.width = `${Math.max(0, (left / (restTotal * 1000)) * 100)}%`;

    if (left <= 0) {
      stopRest();
      vibrate([120, 80, 120]);
      notifyRestDone();
      toast('休息结束，下一组');
    }
  }

  /** 震动封装：iOS 不支持 navigator.vibrate，静默降级 */
  function vibrate(pattern) {
    try {
      if (typeof navigator.vibrate === 'function') navigator.vibrate(pattern);
    } catch (e) { /* iOS 会抛错，忽略 */ }
  }

  /**
   * 休息结束提醒：
   * - iOS 不支持震动，改为声音 + 屏幕闪烁，确保能感知到
   * - 仅在页面可见时播放，避免后台被拦
   */
  let audioCtx = null;
  function notifyRestDone() {
    // 1. 声音提示（WebAudio 生成，无需音频文件）
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        audioCtx = audioCtx || new AC();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const now = audioCtx.currentTime;
        [0, 0.22, 0.44].forEach((offset) => {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.type = 'sine';
          osc.frequency.value = 880;
          gain.gain.setValueAtTime(0.0001, now + offset);
          gain.gain.exponentialRampToValueAtTime(0.22, now + offset + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.16);
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.start(now + offset);
          osc.stop(now + offset + 0.18);
        });
      }
    } catch (e) { /* 音频被系统限制时忽略 */ }

    // 2. 屏幕闪烁提示（所有平台都有效）
    flashScreen();
  }

  function flashScreen() {
    const ov = $('#rest-overlay');
    if (!ov || ov.hidden) return;
    let n = 0;
    const t = setInterval(() => {
      ov.style.background = n % 2 === 0 ? 'rgba(200,255,61,.22)' : '';
      n++;
      if (n > 3) { clearInterval(t); ov.style.background = ''; }
    }, 130);
  }
  function stopRest() {
    if (restTimer) { clearInterval(restTimer); restTimer = null; }
    const ov = $('#rest-overlay');
    if (ov) ov.hidden = true;
  }

  function adjustRest(delta) {
    // 已超时就不要再调了，直接关掉
    if (Date.now() >= restEnd) { stopRest(); return; }
    restEnd += delta * 1000;
    restTotal = Math.max(1, restTotal + delta);
    tickRest();
  }

  /* ==========================================================================
     对话框
     ========================================================================== */
  function confirmDialog(title, desc, onOk, okLabel = '确定', danger = false) {
    const body = h('div', {});
    body.appendChild(h('div', { class: 'sheet-title' }, title));
    body.appendChild(h('div', { class: 'sheet-desc' }, desc));
    body.appendChild(h('div', { class: 'sheet-actions' }, [
      h('button', { class: 'btn btn-ghost', onclick: closeSheet }, '取消'),
      h('button', {
        class: 'btn ' + (danger ? 'btn-danger' : 'btn-accent'),
        onclick: () => { closeSheet(); onOk(); },
      }, okLabel),
    ]));
    openSheet(body);
  }
  global.LJ.confirmDialog = confirmDialog;

  /* ==========================================================================
     日期详情（日历点击）
     ========================================================================== */
  function openDay(dateStr) {
    const list = S.getWorkoutsByDate(dateStr);
    const plan = S.getPlan(dateStr);
    const isPast = dateStr < S.todayStr();

    const body = h('div', {});
    body.appendChild(h('div', { class: 'sheet-title' }, V.fmtDateCN(dateStr)));
    body.appendChild(h('div', { class: 'sheet-desc' },
      list.length ? `完成 ${list.length} 次训练` : (plan && plan.rest ? '休息日' : '没有训练记录')));

    if (list.length) {
      const l = h('div', { class: 'list' });
      list.forEach((w) => {
        l.appendChild(h('div', {
          class: 'row', style: 'cursor:pointer',
          onclick: () => { closeSheet(); openWorkout(w.id); },
        }, [
          h('div', { class: 'row-main' }, [
            h('div', { class: 'row-title', style: 'font-size:14.5px' }, w.name || '训练'),
            h('div', { class: 'row-sub' },
              w.type === 'strength'
                ? `${(w.exercises || []).length} 个动作 · ${V.volumeText(S.volumeOf(w))}kg`
                : `${w.cardio?.duration || 0} 分钟`),
          ]),
          h('span', { class: 'muted' }, '→'),
        ]));
      });
      body.appendChild(l);
    }

    body.appendChild(h('div', { class: 'sheet-actions' }, [
      h('button', {
        class: 'btn btn-ghost',
        onclick: () => {
          closeSheet();
          // 计划：设为休息日 或 取消
          if (plan && plan.rest) {
            S.setPlan(dateStr, null);
            toast('已取消休息日');
          } else {
            S.setPlan(dateStr, { rest: true });
            toast('已标记为休息日');
          }
          render();
        },
      }, plan && plan.rest ? '取消休息日' : '标记休息日'),
      h('button', {
        class: 'btn btn-accent',
        onclick: () => {
          closeSheet();
          // 补录：以该日期新建训练
          startWorkoutAt(dateStr);
        },
      }, isPast ? '补录训练' : '安排训练'),
    ]));

    openSheet(body);
  }
  global.LJ.openDay = openDay;

  function startWorkoutAt(dateStr) {
    startWorkout(null);
    state.editor.date = dateStr;
    renderEditor();
  }

  /* ==========================================================================
     身体数据
     ========================================================================== */
  function openBodySheet(existing) {
    const latest = S.getDB().body[S.getDB().body.length - 1];
    const init = existing || latest || {};
    const draft = {
      date: existing ? existing.date : S.todayStr(),
      weight: init.weight ?? '',
      waist: init.waist ?? '',
      chest: init.chest ?? '',
      hip: init.hip ?? '',
      arm: init.arm ?? '',
      thigh: init.thigh ?? '',
      note: init.note || '',
    };

    const body = h('div', {});
    body.appendChild(h('div', { class: 'sheet-title' }, existing ? '编辑身体数据' : '记录身体数据'));
    body.appendChild(h('div', { class: 'sheet-desc' }, '不需要每天称。一周 1–2 次，看趋势比看单点更有意义。'));

    const mk = (label, key, placeholder, step = '0.1') => {
      const f = h('div', { class: 'field', style: 'margin-bottom:12px' });
      f.appendChild(h('label', { class: 'field-label' }, label));
      f.appendChild(h('input', {
        class: 'input', type: 'number', inputmode: 'decimal', step, placeholder,
        value: draft[key] === '' ? '' : draft[key],
        oninput: (e) => { draft[key] = e.target.value === '' ? '' : Number(e.target.value); },
      }));
      return f;
    };

    // 日期
    const dateField = h('div', { class: 'field', style: 'margin-bottom:12px' });
    dateField.appendChild(h('label', { class: 'field-label' }, '日期'));
    dateField.appendChild(h('input', {
      class: 'input', type: 'date', value: draft.date,
      onchange: (e) => { draft.date = e.target.value; },
    }));
    body.appendChild(dateField);

    body.appendChild(mk('体重（kg）', 'weight', '例如 72.5'));

    body.appendChild(h('div', {
      style: 'font-size:12px;font-weight:600;color:var(--text-2);margin:4px 0 8px',
    }, '围度（cm，选填）'));

    const grid = h('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:10px' });
    [['腰围', 'waist'], ['胸围', 'chest'], ['臀围', 'hip'], ['臂围', 'arm'], ['腿围', 'thigh']].forEach(([l, k]) => {
      const f = h('div', {});
      f.appendChild(h('label', { class: 'field-label' }, l));
      f.appendChild(h('input', {
        class: 'input', type: 'number', inputmode: 'decimal', step: '0.1', placeholder: '—',
        value: draft[k] === '' ? '' : draft[k],
        oninput: (e) => { draft[k] = e.target.value === '' ? '' : Number(e.target.value); },
      }));
      grid.appendChild(f);
    });
    body.appendChild(grid);

    body.appendChild(h('div', { class: 'field', style: 'margin-top:12px' }));
    body.appendChild(h('label', { class: 'field-label' }, '备注'));
    body.appendChild(h('textarea', {
      class: 'textarea', placeholder: '睡眠、饮食、状态…', style: 'min-height:60px',
      oninput: (e) => { draft.note = e.target.value; },
    }, draft.note || ''));

    body.appendChild(h('div', { class: 'sheet-actions' }, [
      h('button', { class: 'btn btn-ghost', onclick: closeSheet }, '取消'),
      h('button', {
        class: 'btn btn-accent',
        onclick: () => {
          if (!draft.weight && !draft.waist && !draft.chest && !draft.hip && !draft.arm && !draft.thigh) {
            toast('至少填写一项数据');
            return;
          }
          S.addBody(draft);
          closeSheet();
          toast('已记录');
          render();
        },
      }, '保存'),
    ]));

    openSheet(body);
  }
  global.LJ.openBodySheet = openBodySheet;

  function openBodyHistory() {
    const list = [...S.getDB().body].sort((a, b) => (a.date < b.date ? 1 : -1));
    const body = h('div', {});
    body.appendChild(h('div', { class: 'sheet-title' }, '身体数据历史'));
    body.appendChild(h('div', { class: 'sheet-desc' }, `共 ${list.length} 条记录`));

    const l = h('div', { class: 'list' });
    list.forEach((b) => {
      l.appendChild(h('div', {
        class: 'row', style: 'cursor:pointer',
        onclick: () => {
          confirmDialog('删除这条记录？', `${b.date} 的身体数据将被删除。`, () => {
            S.deleteBody(b.id);
            closeSheet();
            toast('已删除');
            render();
          }, '删除', true);
        },
      }, [
        h('div', { class: 'row-main' }, [
          h('div', { class: 'row-title', style: 'font-size:14.5px' }, b.date),
          h('div', { class: 'row-sub' }, [
            b.weight ? `${b.weight}kg` : '',
            b.waist ? `腰${b.waist}` : '',
            b.chest ? `胸${b.chest}` : '',
          ].filter(Boolean).join(' · ')),
        ]),
        h('span', { class: 'muted' }, '删除'),
      ]));
    });
    body.appendChild(l);
    openSheet(body);
  }
  global.LJ.openBodyHistory = openBodyHistory;

  /* ==========================================================================
     备份 / 导出 / 导入
     ========================================================================== */
  function downloadFile(filename, content, mime) {
    const blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function stamp() {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  }

  function exportBackup() {
    downloadFile(`练迹备份-${stamp()}.json`, S.exportJSON(), 'application/json');
    toast('备份文件已导出');
  }
  global.LJ.exportBackup = exportBackup;

  function exportCSV() {
    downloadFile(`练迹训练-${stamp()}.csv`, S.exportCSV(), 'text/csv;charset=utf-8');
    toast('CSV 已导出');
  }
  global.LJ.exportCSV = exportCSV;

  function exportBodyCSV() {
    downloadFile(`练迹身体-${stamp()}.csv`, S.exportBodyCSV(), 'text/csv;charset=utf-8');
    toast('CSV 已导出');
  }
  global.LJ.exportBodyCSV = exportBodyCSV;

  function importBackup() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      const f = input.files && input.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        const text = String(reader.result || '');
        // 先校验
        const probe = S.importJSON(text, 'replace');
        if (!probe.ok) {
          toast('导入失败：' + probe.error);
          return;
        }
        // 已覆盖，提示用户
        toast(`已恢复 ${probe.workouts} 条训练 / ${probe.body} 条身体数据`);
        render();
      };
      reader.readAsText(f);
    };
    input.click();
  }
  global.LJ.importBackup = importBackup;

  function confirmReset() {
    confirmDialog(
      '清空全部数据',
      '这会删除本机上所有训练记录、身体数据和设置，且无法恢复。建议先导出备份。',
      () => {
        confirmDialog(
          '再次确认',
          '真的要清空吗？此操作不可撤销。',
          () => {
            S.resetAll();
            toast('已清空');
            render();
          },
          '确认清空',
          true
        );
      },
      '继续',
      true
    );
  }
  global.LJ.confirmReset = confirmReset;

  /* ==========================================================================
     初始化
     ========================================================================== */
  function init() {
    initTheme();
    render();

    // 导航
    V.$$('.tab').forEach((b) => {
      b.addEventListener('click', () => {
        if (state.editor) {
          // 编辑中切 tab，先确认
          cancelEditor();
          return;
        }
        go(b.dataset.tab);
      });
    });

    $('#btn-theme').addEventListener('click', toggleTheme);

    // 休息浮层按钮
    $('#rest-skip').addEventListener('click', () => stopRest());
    $('#rest-plus').addEventListener('click', () => adjustRest(15));
    $('#rest-minus').addEventListener('click', () => adjustRest(-15));

    // 关键：页面从后台回来时，立即校正倒计时
    // 手机系统会冻结后台页面的定时器，回来时必须主动 tick 一次
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && restTimer) {
        tickRest();
      }
    });
    window.addEventListener('pageshow', () => {
      if (restTimer) tickRest();
    });
    window.addEventListener('focus', () => {
      if (restTimer) tickRest();
    });

    // 注册 Service Worker
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch((e) => {
          console.warn('[练迹] SW 注册失败', e);
        });
      });
    }

    // 防止双击缩放
    let lastTouch = 0;
    document.addEventListener('touchend', (e) => {
      const now = Date.now();
      if (now - lastTouch <= 300) e.preventDefault();
      lastTouch = now;
    }, { passive: false });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
