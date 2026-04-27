(function () {
  const API_ENDPOINT = "/api/lead";
  const FALLBACK_EMAIL = "leads@geostroyfacade.com";
  const MAX_FILES = 5;
  const MAX_TOTAL_BASE64_BYTES = 7 * 1024 * 1024;

  const forms = document.querySelectorAll("[data-lead-form]");
  initRevealAnimations();
  initStickyCta();

  forms.forEach((form) => {
    const fileInput = form.querySelector('input[type="file"]');
    const fileName = form.querySelector("[data-file-name]");

    if (fileInput && fileName) {
      fileInput.addEventListener("change", () => {
        const count = fileInput.files.length;
        fileName.textContent = count ? `${count} photo${count === 1 ? "" : "s"} selected` : "No photos selected";
      });
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      const status = form.querySelector(".form-status");
      const submit = form.querySelector(".form-submit");
      setStatus(status, "Preparing your request...", "");
      submit.disabled = true;

      try {
        const formData = new FormData(form);
        const photos = await preparePhotos(fileInput ? Array.from(fileInput.files) : []);
        const payload = {
          source: form.dataset.source || "landing",
          page: window.location.href,
          name: value(formData, "name"),
          phone: value(formData, "phone"),
          email: value(formData, "email"),
          zip: value(formData, "zip") || value(formData, "cityZip"),
          description: value(formData, "description"),
          photos
        };

        if (!payload.name || !payload.phone || !payload.zip || !payload.description) {
          throw new Error("Please fill out name, phone, ZIP and description.");
        }

        setStatus(status, "Sending your request...", "");
        const response = await sendLead(payload);

        if (!response.ok) {
          throw new Error(response.message || "We could not send the request right now.");
        }

        form.reset();
        if (fileName) fileName.textContent = "No photos selected";
        setStatus(status, "Thanks. We received your request and will review your photos shortly.", "success");
      } catch (error) {
        if (window.location.protocol === "file:") {
          openMailFallback(form);
          setStatus(status, "Local preview opened an email draft. Deploy the API endpoint to enable automatic email and Telegram delivery.", "error");
        } else {
          setStatus(status, error.message || "Something went wrong. Please try again.", "error");
        }
      } finally {
        submit.disabled = false;
      }
    });
  });

  async function sendLead(payload) {
    const response = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    let data = {};
    try {
      data = await response.json();
    } catch (error) {
      data = {};
    }

    return {
      ok: response.ok && data.ok !== false,
      message: data.message
    };
  }

  async function preparePhotos(files) {
    if (!files.length) return [];
    if (files.length > MAX_FILES) {
      throw new Error(`Please upload up to ${MAX_FILES} photos.`);
    }

    const photos = [];
    let total = 0;

    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        throw new Error("Please upload image files only.");
      }
      const photo = await compressImage(file);
      total += photo.content.length;
      if (total > MAX_TOTAL_BASE64_BYTES) {
        throw new Error("The selected photos are too large. Please upload fewer photos or smaller files.");
      }
      photos.push(photo);
    }

    return photos;
  }

  function compressImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const image = new Image();
        image.onload = () => {
          const maxSide = 1500;
          const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
          const width = Math.max(1, Math.round(image.width * scale));
          const height = Math.max(1, Math.round(image.height * scale));
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext("2d");
          context.drawImage(image, 0, 0, width, height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.76);
          resolve({
            filename: safePhotoName(file.name),
            mime: "image/jpeg",
            content: dataUrl.split(",")[1]
          });
        };
        image.onerror = () => reject(new Error("One photo could not be read. Please upload JPG, PNG or WEBP images."));
        image.src = reader.result;
      };
      reader.onerror = () => reject(new Error("One photo could not be read."));
      reader.readAsDataURL(file);
    });
  }

  function openMailFallback(form) {
    const formData = new FormData(form);
    const subject = encodeURIComponent("New stucco repair estimate request");
    const body = encodeURIComponent([
      `Name: ${value(formData, "name")}`,
      `Phone: ${value(formData, "phone")}`,
      `Email: ${value(formData, "email")}`,
      `ZIP / City: ${value(formData, "zip") || value(formData, "cityZip")}`,
      "",
      value(formData, "description")
    ].join("\n"));
    window.location.href = `mailto:${FALLBACK_EMAIL}?subject=${subject}&body=${body}`;
  }

  function setStatus(element, message, type) {
    if (!element) return;
    element.textContent = message;
    element.className = `form-status ${type || ""}`.trim();
  }

  function value(formData, key) {
    return String(formData.get(key) || "").trim();
  }

  function safePhotoName(name) {
    const base = String(name || "photo").replace(/\.[^.]+$/, "").replace(/[^a-z0-9-_]+/gi, "-").replace(/^-|-$/g, "");
    return `${base || "photo"}.jpg`;
  }

  function initRevealAnimations() {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const targets = document.querySelectorAll([
      ".proof-strip > div",
      ".section-heading",
      ".repair-card",
      ".service-grid article",
      ".timeline article",
      ".trust-grid article",
      ".area-links a",
      ".faq-list details",
      ".inline-cta",
      ".bottom-copy",
      ".bottom-cta .lead-form"
    ].join(","));

    if (reduceMotion || !("IntersectionObserver" in window)) {
      targets.forEach((target) => target.classList.add("is-visible"));
      return;
    }

    targets.forEach((target, index) => {
      target.classList.add("reveal");
      target.style.setProperty("--reveal-delay", `${Math.min(index % 5, 4) * 55}ms`);
    });

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.16, rootMargin: "0px 0px -8% 0px" });

    targets.forEach((target) => observer.observe(target));
  }

  function initStickyCta() {
    const estimateForm = document.querySelector("#estimate");
    const stickyCta = document.querySelector(".mobile-sticky-cta");
    if (!estimateForm || !stickyCta || !("IntersectionObserver" in window)) return;

    const heroObserver = new IntersectionObserver((entries) => {
      const entry = entries[0];
      document.body.classList.toggle("hide-sticky-cta", entry.isIntersecting);
    }, { threshold: 0.18 });

    const scrollObserver = new IntersectionObserver((entries) => {
      const entry = entries[0];
      document.body.classList.toggle("show-sticky-cta", !entry.isIntersecting);
    }, { threshold: 0.05 });

    heroObserver.observe(estimateForm);
    scrollObserver.observe(document.querySelector(".hero") || estimateForm);
  }
})();
