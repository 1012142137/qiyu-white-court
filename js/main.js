/* =========================================================
   栖屿 · 白庭
   A perfectly ordinary property website.
   ========================================================= */

(() => {
  "use strict";

  const body = document.body;
  const html = document.documentElement;
  const nav = document.getElementById("site-nav");
  const progressBar = document.getElementById("nav-progress-bar");
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  body.classList.add("reveal-ready");

  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (a, b, value) => {
    const t = clamp((value - a) / (b - a));
    return t * t * (3 - 2 * t);
  };

  const page = {
    mood: 0,
    progress: 0,
    finaleProgress: 0,
    isFinale: false,
  };

  /* ---------- reveal on entry ---------- */

  const revealItems = [...document.querySelectorAll("[data-reveal]")];
  revealItems.forEach((el, index) => {
    el.style.transitionDelay = `${Math.min((index % 5) * 70, 280)}ms`;
  });

  if ("IntersectionObserver" in window) {
    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -7% 0px" }
    );
    revealItems.forEach((el) => revealObserver.observe(el));
  } else {
    revealItems.forEach((el) => el.classList.add("is-visible"));
  }

  /* ---------- sound design ---------- */

  const soundToggle = document.getElementById("sound-toggle");
  const sound = {
    ctx: null,
    enabled: false,
    master: null,
    droneFilter: null,
    droneGain: null,
    noiseGain: null,
    heartbeatTimer: null,
    tension: 0,
    stingPlayed: false,

    init() {
      if (this.ctx) return true;
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;

      try {
        const ctx = new AudioContext();
        const master = ctx.createGain();
        master.gain.value = 0;
        master.connect(ctx.destination);

        const droneFilter = ctx.createBiquadFilter();
        droneFilter.type = "lowpass";
        droneFilter.frequency.value = 180;
        droneFilter.Q.value = 0.9;

        const droneGain = ctx.createGain();
        droneGain.gain.value = 0.16;
        droneFilter.connect(droneGain).connect(master);

        const oscA = ctx.createOscillator();
        oscA.type = "sine";
        oscA.frequency.value = 43.65;
        const oscAGain = ctx.createGain();
        oscAGain.gain.value = 0.2;
        oscA.connect(oscAGain).connect(droneFilter);

        const oscB = ctx.createOscillator();
        oscB.type = "triangle";
        oscB.frequency.value = 44.2;
        const oscBGain = ctx.createGain();
        oscBGain.gain.value = 0.07;
        oscB.connect(oscBGain).connect(droneFilter);

        const oscC = ctx.createOscillator();
        oscC.type = "sine";
        oscC.frequency.value = 87.3;
        const oscCGain = ctx.createGain();
        oscCGain.gain.value = 0.022;
        oscC.connect(oscCGain).connect(droneFilter);

        const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        const noiseData = noiseBuffer.getChannelData(0);
        let last = 0;
        for (let i = 0; i < noiseData.length; i += 1) {
          const white = Math.random() * 2 - 1;
          last = (last + 0.018 * white) / 1.018;
          noiseData[i] = last * 3.2;
        }
        const noise = ctx.createBufferSource();
        noise.buffer = noiseBuffer;
        noise.loop = true;
        const noiseFilter = ctx.createBiquadFilter();
        noiseFilter.type = "lowpass";
        noiseFilter.frequency.value = 380;
        const noiseGain = ctx.createGain();
        noiseGain.gain.value = 0.026;
        noise.connect(noiseFilter).connect(noiseGain).connect(master);

        oscA.start();
        oscB.start();
        oscC.start();
        noise.start();

        this.ctx = ctx;
        this.master = master;
        this.droneFilter = droneFilter;
        this.droneGain = droneGain;
        this.noiseGain = noiseGain;
        return true;
      } catch (error) {
        return false;
      }
    },

    async enable() {
      if (!this.init()) {
        soundToggle.querySelector(".sound-toggle__state").textContent = "N/A";
        soundToggle.setAttribute("aria-label", "环境声音在当前浏览器中不可用");
        return false;
      }
      await this.ctx.resume();
      this.enabled = true;
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(Math.max(this.master.gain.value, 0.0001), now);
      this.master.gain.exponentialRampToValueAtTime(0.22, now + 2.6);
      this.updateTensionSound();
      this.heartLoop();
      return true;
    },

    disable() {
      this.enabled = false;
      clearTimeout(this.heartbeatTimer);
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(this.master.gain.value, now);
      this.master.gain.linearRampToValueAtTime(0.0001, now + 0.55);
      window.setTimeout(() => {
        if (!this.enabled && this.ctx) this.ctx.suspend().catch(() => {});
      }, 700);
    },

    setTension(value) {
      this.tension = clamp(value);
      if (this.enabled) this.updateTensionSound();
    },

    updateTensionSound() {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const tension = this.tension;
      this.droneFilter.frequency.setTargetAtTime(140 + tension * 560, now, 1.2);
      this.droneGain.gain.setTargetAtTime(0.13 + tension * 0.15, now, 1.1);
      this.noiseGain.gain.setTargetAtTime(0.017 + tension * 0.05, now, 1.5);
    },

    thump(time, frequency = 54, level = 0.35) {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(frequency, time);
      osc.frequency.exponentialRampToValueAtTime(frequency * 0.66, time + 0.24);
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.linearRampToValueAtTime(level, time + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.32);
      osc.connect(gain).connect(this.master);
      osc.start(time);
      osc.stop(time + 0.38);
    },

    heartLoop() {
      clearTimeout(this.heartbeatTimer);
      if (!this.enabled || !this.ctx) return;
      const now = this.ctx.currentTime;
      if (this.tension > 0.18) {
        this.thump(now + 0.03, 55, 0.1 + this.tension * 0.18);
        this.thump(now + 0.27, 44, 0.06 + this.tension * 0.11);
      }
      const bpm = 46 + this.tension * 58;
      this.heartbeatTimer = window.setTimeout(() => this.heartLoop(), 60000 / bpm);
    },

    sting() {
      if (!this.enabled || !this.ctx || this.stingPlayed) return;
      this.stingPlayed = true;
      const now = this.ctx.currentTime;
      const length = this.ctx.sampleRate * 1.6;
      const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / length);
      }
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(2400, now);
      filter.frequency.exponentialRampToValueAtTime(380, now + 1.2);
      filter.Q.value = 0.6;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.34, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.5);
      source.connect(filter).connect(gain).connect(this.master);
      source.start(now);

      const low = this.ctx.createOscillator();
      const lowGain = this.ctx.createGain();
      low.type = "sine";
      low.frequency.setValueAtTime(76, now);
      low.frequency.exponentialRampToValueAtTime(27, now + 1.1);
      lowGain.gain.setValueAtTime(0.0001, now);
      lowGain.gain.linearRampToValueAtTime(0.26, now + 0.03);
      lowGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.7);
      low.connect(lowGain).connect(this.master);
      low.start(now);
      low.stop(now + 1.8);
    },
  };

  soundToggle.addEventListener("click", async () => {
    const next = soundToggle.getAttribute("aria-pressed") !== "true";
    if (next) {
      const ok = await sound.enable();
      if (!ok) return;
    } else {
      sound.disable();
    }
    soundToggle.setAttribute("aria-pressed", String(next));
    soundToggle.setAttribute("aria-label", next ? "关闭环境声音" : "开启环境声音");
    soundToggle.querySelector(".sound-toggle__state").textContent = next ? "ON" : "OFF";
  });

  document.addEventListener("keydown", (event) => {
    if (event.key.toLowerCase() === "m" && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const target = event.target;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      soundToggle.click();
    }
  });

  /* ---------- dynamic title / favicon ---------- */

  const favicon = document.querySelector('link[rel="icon"]');
  const faviconNormal = favicon ? favicon.getAttribute("href") : "";
  const faviconLate = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' fill='%23090c0a'/%3E%3Ccircle cx='32' cy='32' r='20' fill='none' stroke='%238d2424' stroke-width='2'/%3E%3Ccircle cx='32' cy='32' r='6' fill='%23b73c36'/%3E%3C/svg%3E";
  let currentTitle = document.title;
  let lateFavicon = false;

  const scheduleTitle = (title) => {
    if (!title || title === currentTitle) return;
    currentTitle = title;
    document.title = title;
  };

  const updateChrome = () => {
    let title = "栖屿·白庭｜让生活回到安静";
    if (page.isFinale && page.finaleProgress > 0.78) {
      title = "欢迎回家";
    } else if (page.isFinale) {
      title = "白庭｜参观尚未结束";
    } else if (page.mood >= 3) {
      title = "白庭｜请勿回头";
    } else if (page.mood >= 2) {
      title = "白庭｜您在哪里？";
    } else if (page.mood >= 1) {
      title = "栖屿·白庭｜请继续向下";
    }
    scheduleTitle(title);

    const shouldLate = page.mood >= 2;
    if (favicon && shouldLate !== lateFavicon) {
      lateFavicon = shouldLate;
      favicon.setAttribute("href", shouldLate ? faviconLate : faviconNormal);
    }
  };

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && page.mood >= 2) {
      document.title = "别走。";
    } else {
      currentTitle = "";
      updateChrome();
    }
  });

  /* ---------- scroll-driven helpers ---------- */

  const sections = {
    residence: document.querySelector(".residence"),
    daily: document.querySelector(".daily"),
    residents: document.querySelector(".residents"),
    night: document.querySelector(".night"),
    security: document.querySelector(".security"),
    plan: document.querySelector(".plan"),
    reserve: document.querySelector(".reserve"),
    finale: document.querySelector(".finale"),
  };

  const darkSections = [
    sections.night,
    sections.security,
    sections.plan,
    sections.reserve,
    sections.finale,
  ].filter(Boolean);

  const syncSwapA11y = (root) => {
    if (!root) return;
    const weird = root.classList.contains("is-weird") || !!root.closest(".is-weird");
    const swaps = root.matches(".swap") ? [root] : [...root.querySelectorAll(".swap")];
    swaps.forEach((swap) => {
      const now = swap.querySelector(".swap__now");
      const late = swap.querySelector(".swap__late");
      if (now) now.setAttribute("aria-hidden", weird ? "true" : "false");
      if (late) late.setAttribute("aria-hidden", weird ? "false" : "true");
    });
  };

  const setClass = (element, className, enabled) => {
    if (!element) return;
    const changed = element.classList.contains(className) !== enabled;
    element.classList.toggle(className, enabled);
    if (className === "is-weird" && changed) syncSwapA11y(element);
  };

  const sectionProgress = (element) => {
    if (!element) return 0;
    const rect = element.getBoundingClientRect();
    const distance = Math.max(1, element.offsetHeight - window.innerHeight);
    return clamp(-rect.top / distance);
  };

  /* ---------- residence gallery ---------- */

  const mediaStack = document.getElementById("media-stack");
  const mediaImages = mediaStack ? [...mediaStack.querySelectorAll("img")] : [];
  const mediaFeatures = [...document.querySelectorAll(".feature")];
  const mediaIndex = document.getElementById("media-index");
  const mediaCaption = document.getElementById("media-caption");
  const mediaCaptions = [
    "会客厅 / THE LIVING ROOM",
    "私宴区 / THE DINING ROOM",
    "厨房 / THE KITCHEN",
  ];
  let activeMedia = 0;

  const setActiveMedia = (index) => {
    if (index === activeMedia || !mediaImages[index]) return;
    activeMedia = index;
    mediaImages.forEach((img, i) => img.classList.toggle("is-active", i === index));
    mediaFeatures.forEach((feature, i) => feature.classList.toggle("is-active", i === index));
    if (mediaIndex) mediaIndex.textContent = String(index + 1).padStart(2, "0");
    if (mediaCaption) mediaCaption.textContent = mediaCaptions[index];
  };

  /* ---------- night / security clocks ---------- */

  const nightClock = document.getElementById("night-clock");
  const finaleClock = document.getElementById("finale-clock");
  const feedClock = document.getElementById("feed-clock");
  const feedTime = document.getElementById("feed-time");
  const pageStarted = Date.now();

  const pad = (value) => String(value).padStart(2, "0");

  const updateClocks = () => {
    const elapsed = Math.floor((Date.now() - pageStarted) / 1000);
    const seconds = elapsed % 60;
    const minutes = Math.floor(elapsed / 60) % 60;
    const stamp = `02:47:${pad(seconds)}`;
    if (nightClock) nightClock.textContent = stamp;
    if (finaleClock) finaleClock.textContent = stamp;
    if (feedClock) feedClock.textContent = stamp;
    if (feedTime) feedTime.textContent = `${pad(Math.floor(elapsed / 60))}:${pad(seconds)}`;
  };

  updateClocks();
  window.setInterval(updateClocks, 1000);

  /* ---------- plan ---------- */

  const plan = sections.plan;
  const planRoute = document.getElementById("plan-route");
  const youMarker = document.getElementById("you-marker");
  let routeLength = 0;

  if (planRoute && youMarker) {
    try {
      routeLength = planRoute.getTotalLength();
    } catch (error) {
      routeLength = 0;
    }
  }

  const updatePlan = (progress) => {
    if (!plan) return;
    plan.style.setProperty("--plan-p", progress.toFixed(4));
    const draw = smoothstep(0.1, 0.65, progress);
    plan.style.setProperty("--draw", draw.toFixed(4));
    plan.style.setProperty("--plan-hidden-opacity", smoothstep(0.08, 0.32, progress).toFixed(4));
    setClass(plan, "is-weird", progress > 0.34);

    if (routeLength && planRoute && youMarker) {
      const traveled = smoothstep(0.12, 0.86, progress);
      const point = planRoute.getPointAtLength(routeLength * traveled);
      youMarker.setAttribute("transform", `translate(${point.x} ${point.y})`);
    }
  };

  /* ---------- reserve ---------- */

  const reserve = sections.reserve;
  const reserveForm = document.getElementById("reserve-form");
  const formResponse = document.getElementById("form-response");
  const formFields = reserveForm ? [...reserveForm.querySelectorAll("input")] : [];
  const placeholders = {
    normal: {
      "guest-name": "您叫什么名字",
      "guest-phone": "我们如何联系您",
      "guest-date": "选择日期",
      "guest-count": "1 人",
    },
    late: {
      "guest-name": "我们早就知道了",
      "guest-phone": "我们正在联系您",
      "guest-date": "今天 · 02:47",
      "guest-count": "1 人 · 请勿同行",
    },
  };
  let reserveLate = false;

  const updateReserve = (progress) => {
    if (!reserve) return;
    const isLate = progress > 0.3;
    if (isLate !== reserveLate) {
      reserveLate = isLate;
      setClass(reserve, "is-weird", isLate);
      formFields.forEach((input) => {
        if (!input.value) {
          input.placeholder = isLate
            ? placeholders.late[input.id] || input.placeholder
            : placeholders.normal[input.id] || input.placeholder;
        }
      });
    }
  };

  if (reserveForm) {
    reserveForm.addEventListener("submit", (event) => {
      event.preventDefault();
      reserveForm.querySelectorAll("input").forEach((input) => {
        input.setAttribute("readonly", "readonly");
      });
      if (formResponse) formResponse.hidden = false;
      setClass(reserve, "is-sent", true);
      setClass(reserve, "is-weird", true);
      if (formResponse) {
        formResponse.scrollIntoView({ behavior: prefersReduced ? "auto" : "smooth", block: "center" });
      }
    });
  }

  /* ---------- finale ---------- */

  const finale = sections.finale;
  const finaleSticky = document.getElementById("finale-sticky");
  const hallScene = document.getElementById("hall-scene");
  const hallFigure = document.getElementById("hall-figure");
  const hallFlash = document.getElementById("hall-flash");
  const faceReveal = document.getElementById("face-reveal");
  const finaleStatic = document.getElementById("finale-static");
  const finaleWhiteout = document.getElementById("finale-whiteout");
  const finaleEnd = document.getElementById("finale-end");
  const finalCaptions = [...document.querySelectorAll(".final-caption")];
  const restart = document.getElementById("restart");
  let flashFired = false;

  if (restart) {
    restart.addEventListener("click", () => window.location.reload());
  }

  const captionRanges = [
    [0.015, 0.135],
    [0.18, 0.32],
    [0.36, 0.515],
    [0.55, 0.69],
    [0.72, 0.815],
  ];

  const updateFinale = (progress) => {
    if (!finale) return;
    page.finaleProgress = progress;
    finale.style.setProperty("--final-p", progress.toFixed(4));

    const sceneScale = lerp(0.93, 1.35, smoothstep(0.04, 0.78, progress));
    hallScene.style.setProperty("--scene-scale", sceneScale.toFixed(4));

    const figureAppear = smoothstep(0.14, 0.29, progress);
    const figureGrow = smoothstep(0.2, 0.8, progress);
    const figureFadeOut = 1 - smoothstep(0.82, 0.9, progress);
    const figureScale = 0.55 + Math.pow(figureGrow, 2.35) * 8.2;
    const rise = smoothstep(0.35, 0.82, progress) * 24;
    hallFigure.style.setProperty("--fig-opacity", (figureAppear * figureFadeOut).toFixed(4));
    hallFigure.style.setProperty("--fig-scale", figureScale.toFixed(3));
    hallFigure.style.setProperty("--fig-rise", `${rise.toFixed(2)}%`);

    finalCaptions.forEach((caption, index) => {
      const [start, end] = captionRanges[index] || [2, 3];
      caption.classList.toggle("is-visible", progress >= start && progress < end);
    });

    const faceVisible = progress >= 0.785 && progress < 0.955;
    setClass(faceReveal, "is-visible", faceVisible);
    setClass(finaleStatic, "is-visible", progress >= 0.78 && progress < 0.955);
    setClass(finaleEnd, "is-visible", progress >= 0.935);

    if (progress >= 0.84 && !flashFired) {
      flashFired = true;
      hallFlash.classList.add("is-firing");
      finaleWhiteout.classList.add("is-visible");
      sound.setTension(1);
      sound.sting();
      window.setTimeout(() => hallFlash.classList.remove("is-firing"), 900);
      window.setTimeout(() => finaleWhiteout.classList.remove("is-visible"), 1700);
    }

    setClass(body, "is-finale", progress > 0.008);
  };

  /* ---------- camera eye follows the pointer ---------- */

  const viewerEyePupil = document.querySelector(".feed__viewer-eye span");
  let pointerX = window.innerWidth / 2;
  let pointerY = window.innerHeight / 2;

  window.addEventListener(
    "pointermove",
    (event) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
      if (!viewerEyePupil) return;
      const eye = viewerEyePupil.parentElement;
      const rect = eye.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) return;
      const dx = clamp((event.clientX - (rect.left + rect.width / 2)) / 90, -1, 1);
      const dy = clamp((event.clientY - (rect.top + rect.height / 2)) / 60, -1, 1);
      viewerEyePupil.style.transform = `translate(calc(-50% + ${(dx * 12).toFixed(1)}px), calc(-50% + ${(dy * 6).toFixed(1)}px))`;
    },
    { passive: true }
  );

  /* ---------- cursor whisper ---------- */

  const whisper = document.getElementById("cursor-whisper");
  let whisperTimer = null;

  window.addEventListener(
    "pointermove",
    (event) => {
      if (!whisper || !plan || !plan.classList.contains("is-weird") || body.classList.contains("is-finale")) {
        whisper.classList.remove("is-visible");
        return;
      }
      if (event.clientY < window.innerHeight * 0.2) return;
      whisper.style.left = `${event.clientX}px`;
      whisper.style.top = `${event.clientY}px`;
      whisper.textContent = "这里没有出口。";
      whisper.classList.add("is-visible");
      clearTimeout(whisperTimer);
      whisperTimer = window.setTimeout(() => whisper.classList.remove("is-visible"), 1400);
    },
    { passive: true }
  );

  /* ---------- main frame ---------- */

  const update = () => {
    const scrollTop = window.scrollY;
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const overall = clamp(scrollTop / maxScroll);
    page.progress = overall;
    html.style.setProperty("--page-progress", overall.toFixed(5));

    if (nav) {
      nav.classList.toggle("is-scrolled", scrollTop > 24);
      const probe = 72;
      const onDark = darkSections.some((section) => {
        const rect = section.getBoundingClientRect();
        return rect.top <= probe && rect.bottom > probe;
      });
      nav.classList.toggle("is-light", onDark);
    }

    const mood = overall < 0.1 ? 0 : overall < 0.3 ? 1 : overall < 0.46 ? 2 : 3;
    if (page.mood !== mood) {
      page.mood = mood;
      body.dataset.mood = String(mood);
    }

    /* residence */

    if (sections.residence && mediaFeatures.length) {
      const center = window.innerHeight * 0.47;
      let best = 0;
      let bestDistance = Infinity;
      mediaFeatures.forEach((feature, index) => {
        const rect = feature.getBoundingClientRect();
        const distance = Math.abs(rect.top + rect.height / 2 - center);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = index;
        }
      });
      setActiveMedia(best);
      const p = sectionProgress(sections.residence);
      setClass(sections.residence, "is-weird", p > 0.47);
    }

    /* daily */

    if (sections.daily) {
      const p = sectionProgress(sections.daily);
      setClass(sections.daily, "is-weird", p > 0.3);
      const last = sections.daily.querySelector(".day-row--last");
      setClass(last, "is-weird", p > 0.55);
    }

    /* residents */

    if (sections.residents) {
      const p = sectionProgress(sections.residents);
      setClass(sections.residents, "is-weird", p > 0.34);
    }

    /* night */

    if (sections.night) {
      const p = sectionProgress(sections.night);
      sections.night.style.setProperty("--night-p", p.toFixed(4));
      setClass(sections.night, "is-weird", p > 0.37);
    }

    /* security */

    if (sections.security) {
      const p = sectionProgress(sections.security);
      setClass(sections.security, "is-weird", p > 0.27);
    }

    /* plan */

    if (plan) {
      updatePlan(sectionProgress(plan));
    }

    /* reserve */

    if (reserve) {
      updateReserve(sectionProgress(reserve));
    }

    /* finale */

    if (finale) {
      const p = sectionProgress(finale);
      updateFinale(p);

      if (progressBar) {
        progressBar.style.setProperty("--page-progress", overall.toFixed(5));
      }
    }

    sound.setTension(clamp(overall * 1.08));
    updateChrome();

    // keep the browser from restoring an old scroll state mid-scene
    if (page.isFinale && window.scrollY < 10 && page.finaleProgress > 0.5) {
      // no-op: this exists only to keep the finale state explicit
    }
  };

  let ticking = false;
  const requestUpdate = () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(() => {
      update();
      ticking = false;
    });
  };

  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", requestUpdate);

  // A small idle gesture: the page changes its title if you stop too long.
  let idleTimer = null;
  const armIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => {
      if (page.mood >= 2 && !page.isFinale) {
        scheduleTitle("您还在吗？");
      }
    }, 9000);
  };
  window.addEventListener("scroll", armIdle, { passive: true });
  armIdle();

  update();
  window.setTimeout(update, 120);
  window.addEventListener("load", update, { once: true });
  window.addEventListener("pageshow", update, { once: true });
})();
