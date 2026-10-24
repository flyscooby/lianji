/* ==========================================================================
   练迹 · 数据层
   纯 localStorage 持久化，版本化 schema，支持 JSON 备份/恢复 + CSV 导出
   ========================================================================== */
(function (global) {
  'use strict';

  const KEY = 'lianji.db.v1';
  const SCHEMA = 1;

  /* ---------------- 工具 ---------------- */
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  const todayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const dateStr = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const parseDate = (s) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  };

  const addDays = (s, n) => {
    const d = parseDate(s);
    d.setDate(d.getDate() + n);
    return dateStr(d);
  };

  /* 周一为一周起点 */
  const weekStart = (s) => {
    const d = parseDate(s);
    const wd = (d.getDay() + 6) % 7; // 0=周一
    d.setDate(d.getDate() - wd);
    return dateStr(d);
  };

  const round = (n, p = 1) => {
    const f = Math.pow(10, p);
    return Math.round(n * f) / f;
  };

  /* ---------------- 默认数据 ---------------- */
  function defaultDB() {
    return {
      schema: SCHEMA,
      createdAt: Date.now(),
      settings: {
        theme: 'dark',
        unit: 'kg',
        defaultRest: 90,
        rpeEnabled: true,
        weeklyGoal: 4,
      },
      // 训练模板
      templates: [
        {
          id: 'tpl-push',
          name: '推 · Push',
          type: 'strength',
          focus: '胸 / 肩 / 三头',
          color: 'brand',
          exercises: [
            { id: uid(), name: '卧推', part: '胸', sets: 4, reps: 8, weight: 60, rest: 120 },
            { id: uid(), name: '上斜哑铃推举', part: '胸', sets: 3, reps: 10, weight: 20, rest: 90 },
            { id: uid(), name: '坐姿推肩', part: '肩', sets: 3, reps: 10, weight: 30, rest: 90 },
            { id: uid(), name: '绳索下压', part: '三头', sets: 3, reps: 12, weight: 25, rest: 60 },
          ],
        },
        {
          id: 'tpl-pull',
          name: '拉 · Pull',
          type: 'strength',
          focus: '背 / 二头',
          color: 'blue',
          exercises: [
            { id: uid(), name: '引体向上', part: '背', sets: 4, reps: 8, weight: 0, rest: 120 },
            { id: uid(), name: '高位下拉', part: '背', sets: 4, reps: 10, weight: 50, rest: 90 },
            { id: uid(), name: '坐姿划船', part: '背', sets: 3, reps: 10, weight: 45, rest: 90 },
            { id: uid(), name: '哑铃弯举', part: '二头', sets: 3, reps: 12, weight: 12, rest: 60 },
          ],
        },
        {
          id: 'tpl-legs',
          name: '腿 · Legs',
          type: 'strength',
          focus: '股四 / 腘绳 / 臀',
          color: 'warn',
          exercises: [
            { id: uid(), name: '深蹲', part: '腿', sets: 4, reps: 6, weight: 80, rest: 150 },
            { id: uid(), name: '罗马尼亚硬拉', part: '腿', sets: 3, reps: 10, weight: 60, rest: 120 },
            { id: uid(), name: '腿举', part: '腿', sets: 3, reps: 12, weight: 120, rest: 90 },
            { id: uid(), name: '提踵', part: '腿', sets: 4, reps: 15, weight: 40, rest: 60 },
          ],
        },
        {
          id: 'tpl-cardio',
          name: '有氧 · Cardio',
          type: 'cardio',
          focus: '心肺 / 减脂',
          color: 'blue',
          exercises: [],
        },
      ],
      // 训练记录
      workouts: [],
      // 身体数据
      body: [],
      // 计划（某天安排哪个模板 / 休息日）
      plan: {},
    };
  }

  /* ---------------- 读写 ---------------- */
  let db = null;

  function load() {
    if (db) return db;
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) {
        db = defaultDB();
        save();
        return db;
      }
      const parsed = JSON.parse(raw);
      db = migrate(parsed);
    } catch (e) {
      console.error('[练迹] 数据读取失败，已使用空白数据', e);
      db = defaultDB();
    }
    return db;
  }

  function migrate(d) {
    const base = defaultDB();
    // 补齐缺失字段，避免旧数据崩溃
    const merged = {
      ...base,
      ...d,
      settings: { ...base.settings, ...(d.settings || {}) },
      templates: Array.isArray(d.templates) && d.templates.length ? d.templates : base.templates,
      workouts: Array.isArray(d.workouts) ? d.workouts : [],
      body: Array.isArray(d.body) ? d.body : [],
      plan: d.plan && typeof d.plan === 'object' ? d.plan : {},
      schema: SCHEMA,
    };
    return merged;
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
      return true;
    } catch (e) {
      console.error('[练迹] 保存失败', e);
      if (global.LJ && global.LJ.toast) global.LJ.toast('存储空间不足，保存失败');
      return false;
    }
  }

  /* ---------------- 训练记录 ---------------- */
  /**
   * workout 结构：
   * {
   *   id, date, type: 'strength'|'cardio', name, templateId,
   *   exercises: [{ id, name, part, sets:[{weight, reps, done, rpe}], rest, note }],
   *   cardio: { kind, duration, distance, avgHr, feel },
   *   note, durationMin, createdAt
   * }
   */

  function addWorkout(w) {
    load();
    const rec = {
      id: uid(),
      createdAt: Date.now(),
      ...w,
    };
    db.workouts.unshift(rec);
    db.workouts.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt));
    save();
    return rec;
  }

  function updateWorkout(id, patch) {
    load();
    const i = db.workouts.findIndex((w) => w.id === id);
    if (i < 0) return null;
    db.workouts[i] = { ...db.workouts[i], ...patch };
    save();
    return db.workouts[i];
  }

  function deleteWorkout(id) {
    load();
    const i = db.workouts.findIndex((w) => w.id === id);
    if (i < 0) return false;
    db.workouts.splice(i, 1);
    save();
    return true;
  }

  function getWorkout(id) {
    load();
    return db.workouts.find((w) => w.id === id) || null;
  }

  function getWorkoutsByDate(date) {
    load();
    return db.workouts.filter((w) => w.date === date);
  }

  /* ---------------- 上次训练预填 ---------------- */
  /** 找某个动作最近一次的组数据，用于"复制上次" */
  function lastExerciseData(exerciseName, excludeWorkoutId) {
    load();
    for (const w of db.workouts) {
      if (w.type !== 'strength') continue;
      if (excludeWorkoutId && w.id === excludeWorkoutId) continue;
      for (const ex of w.exercises || []) {
        if (ex.name === exerciseName && ex.sets && ex.sets.length) {
          const valid = ex.sets.filter((s) => s.done || (s.reps > 0));
          if (valid.length) {
            return {
              date: w.date,
              sets: valid.map((s) => ({ weight: s.weight, reps: s.reps, rpe: s.rpe ?? null })),
            };
          }
        }
      }
    }
    return null;
  }

  /** 上次同模板的训练（用于整场复制） */
  function lastWorkoutByTemplate(templateId) {
    load();
    return db.workouts.find((w) => w.templateId === templateId && w.type === 'strength') || null;
  }

  /* ---------------- 统计 ---------------- */
  function volumeOf(w) {
    if (w.type !== 'strength') return 0;
    let v = 0;
    for (const ex of w.exercises || []) {
      for (const s of ex.sets || []) {
        if (s.done && s.weight > 0 && s.reps > 0) v += s.weight * s.reps;
      }
    }
    return v;
  }

  function statsForWeek(weekStartDate) {
    load();
    const start = weekStartDate || weekStart(todayStr());
    const end = addDays(start, 6);
    const list = db.workouts.filter((w) => w.date >= start && w.date <= end);
    return {
      count: list.length,
      volume: round(list.reduce((a, w) => a + volumeOf(w), 0), 0),
      strength: list.filter((w) => w.type === 'strength').length,
      cardio: list.filter((w) => w.type === 'cardio').length,
      list,
    };
  }

  /** 连续训练周数（以周为单位，而非天，更贴合健身节奏） */
  function streakWeeks() {
    load();
    const dates = new Set(db.workouts.map((w) => w.date));
    if (!dates.size) return 0;
    let cursor = weekStart(todayStr());
    let streak = 0;
    // 本周若无训练，从上周开始算（本周还没练不算断）
    const hasThisWeek = [...dates].some((d) => weekStart(d) === cursor);
    if (!hasThisWeek) cursor = addDays(cursor, -7);
    for (let i = 0; i < 260; i++) {
      const end = addDays(cursor, 6);
      const hit = [...dates].some((d) => d >= cursor && d <= end);
      if (!hit) break;
      streak++;
      cursor = addDays(cursor, -7);
    }
    return streak;
  }

  /** 连续训练天数（自然日） */
  function streakDays() {
    load();
    const dates = new Set(db.workouts.map((w) => w.date));
    if (!dates.size) return 0;
    let cursor = todayStr();
    if (!dates.has(cursor)) cursor = addDays(cursor, -1);
    let n = 0;
    for (let i = 0; i < 400; i++) {
      if (!dates.has(cursor)) break;
      n++;
      cursor = addDays(cursor, -1);
    }
    return n;
  }

  /** 某动作的历史最好成绩（最大重量，及对应次数） */
  function personalBest(exerciseName) {
    load();
    let best = null;
    for (const w of db.workouts) {
      if (w.type !== 'strength') continue;
      for (const ex of w.exercises || []) {
        if (ex.name !== exerciseName) continue;
        for (const s of ex.sets || []) {
          if (!s.done || !(s.weight > 0) || !(s.reps > 0)) continue;
          if (!best || s.weight > best.weight || (s.weight === best.weight && s.reps > best.reps)) {
            best = { weight: s.weight, reps: s.reps, date: w.date };
          }
        }
      }
    }
    return best;
  }

  /** 某动作的历史序列（每次训练取最重一组），用于折线图 */
  function exerciseHistory(exerciseName) {
    load();
    const map = new Map();
    for (const w of db.workouts) {
      if (w.type !== 'strength') continue;
      for (const ex of w.exercises || []) {
        if (ex.name !== exerciseName) continue;
        const done = (ex.sets || []).filter((s) => s.done && s.weight > 0);
        if (!done.length) continue;
        const top = done.reduce((a, b) => (b.weight > a.weight ? b : a));
        // 同一天多次训练取最大
        const prev = map.get(w.date);
        if (!prev || top.weight > prev.weight) {
          map.set(w.date, { date: w.date, weight: top.weight, reps: top.reps });
        }
      }
    }
    return [...map.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  }

  /** 所有出现过的动作名，用于选择器 */
  function allExerciseNames() {
    load();
    const set = new Set();
    for (const t of db.templates) {
      for (const ex of t.exercises || []) set.add(ex.name);
    }
    for (const w of db.workouts) {
      for (const ex of w.exercises || []) set.add(ex.name);
    }
    return [...set].sort();
  }

  /* ---------------- 身体数据 ---------------- */
  /**
   * body 结构：{ id, date, weight, waist, chest, hip, arm, thigh, note }
   */
  function addBody(rec) {
    load();
    // 同一天覆盖（避免一天多条）
    const i = db.body.findIndex((b) => b.date === rec.date);
    const item = { id: i >= 0 ? db.body[i].id : uid(), ...rec };
    if (i >= 0) db.body[i] = item;
    else db.body.push(item);
    db.body.sort((a, b) => (a.date < b.date ? -1 : 1));
    save();
    return item;
  }

  function deleteBody(id) {
    load();
    const i = db.body.findIndex((b) => b.id === id);
    if (i < 0) return false;
    db.body.splice(i, 1);
    save();
    return true;
  }

  function bodySeries(field) {
    load();
    return db.body
      .filter((b) => typeof b[field] === 'number' && b[field] > 0)
      .map((b) => ({ date: b.date, value: b[field] }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));
  }

  /* ---------------- 计划 ---------------- */
  function setPlan(date, value) {
    load();
    if (!value) delete db.plan[date];
    else db.plan[date] = value; // { templateId } 或 { rest: true }
    save();
  }

  function getPlan(date) {
    load();
    return db.plan[date] || null;
  }

  /* ---------------- 设置 ---------------- */
  function setSetting(k, v) {
    load();
    db.settings[k] = v;
    save();
  }
  function getSettings() {
    load();
    return db.settings;
  }

  /* ---------------- 模板 ---------------- */
  function getTemplates() {
    load();
    return db.templates;
  }
  function getTemplate(id) {
    load();
    return db.templates.find((t) => t.id === id) || null;
  }
  function saveTemplate(tpl) {
    load();
    const i = db.templates.findIndex((t) => t.id === tpl.id);
    if (i >= 0) db.templates[i] = tpl;
    else db.templates.push({ ...tpl, id: tpl.id || uid() });
    save();
    return tpl;
  }
  function deleteTemplate(id) {
    load();
    const i = db.templates.findIndex((t) => t.id === id);
    if (i < 0) return false;
    db.templates.splice(i, 1);
    save();
    return true;
  }

  /* ---------------- 备份 / 恢复 / 导出 ---------------- */
  function exportJSON() {
    load();
    return JSON.stringify(
      { app: '练迹', schema: SCHEMA, exportedAt: new Date().toISOString(), data: db },
      null,
      2
    );
  }

  /**
   * 导入 JSON
   * mode: 'replace' 覆盖 | 'merge' 合并（按 id 去重，保留双方）
   */
  function importJSON(text, mode = 'replace') {
    let obj;
    try {
      obj = JSON.parse(text);
    } catch (e) {
      return { ok: false, error: '文件不是合法的 JSON' };
    }
    const incoming = obj && obj.data ? obj.data : obj;
    if (!incoming || typeof incoming !== 'object') {
      return { ok: false, error: '文件结构不正确' };
    }
    if (!Array.isArray(incoming.workouts) && !Array.isArray(incoming.body)) {
      return { ok: false, error: '文件里没有训练或身体数据' };
    }

    const clean = migrate(incoming);

    if (mode === 'replace') {
      db = clean;
      save();
      return { ok: true, mode, workouts: db.workouts.length, body: db.body.length };
    }

    // merge：按 id 去重
    load();
    const wIds = new Set(db.workouts.map((w) => w.id));
    const bIds = new Set(db.body.map((b) => b.id));
    let addedW = 0, addedB = 0;
    for (const w of clean.workouts) {
      if (!wIds.has(w.id)) { db.workouts.push(w); addedW++; }
    }
    for (const b of clean.body) {
      if (!bIds.has(b.id)) { db.body.push(b); addedB++; }
    }
    db.workouts.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt));
    db.body.sort((a, b) => (a.date < b.date ? -1 : 1));
    save();
    return { ok: true, mode, workouts: addedW, body: addedB };
  }

  function exportCSV() {
    load();
    const rows = [];
    rows.push(['类型', '日期', '训练名称', '动作', '组序', '重量(kg)', '次数', 'RPE', '完成', '有氧类型', '时长(分)', '距离(km)', '平均心率', '感受', '备注']);

    for (const w of db.workouts) {
      if (w.type === 'strength') {
        if (!w.exercises || !w.exercises.length) {
          rows.push(['力量', w.date, w.name || '', '', '', '', '', '', '', '', '', '', '', '', w.note || '']);
          continue;
        }
        for (const ex of w.exercises) {
          if (!ex.sets || !ex.sets.length) {
            rows.push(['力量', w.date, w.name || '', ex.name, '', '', '', '', '', '', '', '', '', '', ex.note || '']);
            continue;
          }
          ex.sets.forEach((s, i) => {
            rows.push([
              '力量', w.date, w.name || '', ex.name, i + 1,
              s.weight ?? '', s.reps ?? '', s.rpe ?? '', s.done ? '是' : '否',
              '', '', '', '', '', ex.note || w.note || '',
            ]);
          });
        }
      } else {
        const c = w.cardio || {};
        rows.push([
          '有氧', w.date, w.name || '', '', '', '', '', '', '', 
          c.kind || '', c.duration ?? '', c.distance ?? '', c.avgHr ?? '', c.feel ?? '', w.note || '',
        ]);
      }
    }

    const esc = (v) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    // BOM 保证 Excel 中文不乱码
    return '\uFEFF' + rows.map((r) => r.map(esc).join(',')).join('\r\n');
  }

  function exportBodyCSV() {
    load();
    const rows = [['日期', '体重(kg)', '腰围(cm)', '胸围(cm)', '臀围(cm)', '臂围(cm)', '腿围(cm)', '备注']];
    for (const b of db.body) {
      rows.push([b.date, b.weight ?? '', b.waist ?? '', b.chest ?? '', b.hip ?? '', b.arm ?? '', b.thigh ?? '', b.note || '']);
    }
    const esc = (v) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    return '\uFEFF' + rows.map((r) => r.map(esc).join(',')).join('\r\n');
  }

  /* ---------------- 清空 ---------------- */
  function resetAll() {
    db = defaultDB();
    save();
  }

  function getDB() {
    load();
    return db;
  }

  /* ---------------- 导出模块 ---------------- */
  global.LJStore = {
    uid, todayStr, dateStr, parseDate, addDays, weekStart, round,
    load, save, getDB,
    addWorkout, updateWorkout, deleteWorkout, getWorkout, getWorkoutsByDate,
    lastExerciseData, lastWorkoutByTemplate,
    volumeOf, statsForWeek, streakWeeks, streakDays, personalBest, exerciseHistory, allExerciseNames,
    addBody, deleteBody, bodySeries,
    setPlan, getPlan,
    setSetting, getSettings,
    getTemplates, getTemplate, saveTemplate, deleteTemplate,
    exportJSON, importJSON, exportCSV, exportBodyCSV,
    resetAll,
    defaultDB,
  };
})(window);
