/* Handler dos formulários — substitui o envio do Elementor (admin-ajax.php)
   pela nova API. Espelha a validação (campos obrigatórios) e faz upload do PDF.
   Detecta automaticamente:
     - formulário com anexo_pdf  -> /api/inscricao (multipart)
     - formulário de contato     -> /api/contato   (urlencoded)
*/
(function () {
  "use strict";

  function fieldKey(name) {
    // form_fields[nome_completo]     -> nome_completo
    // form_fields[replicabilidade][] -> replicabilidade
    var m = name && name.match(/form_fields\[([^\]]+)\]/);
    return m ? m[1] : name;
  }

  function ensureMsgBox(form) {
    var box = form.querySelector(".premio-msg");
    if (!box) {
      box = document.createElement("div");
      box.className = "premio-msg";
      box.style.cssText =
        "margin:14px 0;padding:12px 16px;border-radius:6px;font-size:15px;display:none;line-height:1.4";
      form.insertBefore(box, form.firstChild);
    }
    return box;
  }

  function showMsg(form, type, text) {
    var box = ensureMsgBox(form);
    box.style.display = "block";
    if (type === "success") {
      box.style.background = "#e6f4ea";
      box.style.color = "#1e7e34";
      box.style.border = "1px solid #b7dfc2";
    } else {
      box.style.background = "#fdecea";
      box.style.color = "#b3261e";
      box.style.border = "1px solid #f5c6cb";
    }
    box.innerHTML = text;
    box.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function clearFieldErrors(form) {
    form.querySelectorAll(".premio-field-error").forEach(function (e) {
      e.remove();
    });
    form.querySelectorAll(".premio-invalid").forEach(function (e) {
      e.classList.remove("premio-invalid");
      e.style.borderColor = "";
    });
  }

  function markFieldError(form, key, msg) {
    var el =
      form.querySelector('[name="form_fields[' + key + ']"]') ||
      form.querySelector('[name="form_fields[' + key + '][]"]') ||
      form.querySelector('[name="' + key + '"]');
    if (!el) return;
    el.classList.add("premio-invalid");
    el.style.borderColor = "#b3261e";
    var group = el.closest(".elementor-field-group") || el.parentNode;
    var e = document.createElement("div");
    e.className = "premio-field-error";
    e.style.cssText = "color:#b3261e;font-size:13px;margin-top:4px";
    e.textContent = msg;
    group.appendChild(e);
  }

  // Validação client-side: campos com required no HTML
  function clientValidate(form, hasFile) {
    var errors = {};
    var controls = form.querySelectorAll("input, select, textarea");
    controls.forEach(function (el) {
      if (!el.name) return;
      var key = fieldKey(el.name);
      if (el.type === "file") {
        if (el.hasAttribute("required") && (!el.files || el.files.length === 0)) {
          errors[key] = "O anexo em PDF é obrigatório.";
        } else if (el.files && el.files[0]) {
          var f = el.files[0];
          if (!/\.pdf$/i.test(f.name) && f.type !== "application/pdf")
            errors[key] = "O anexo deve ser um arquivo PDF.";
          else if (f.size > 10 * 1024 * 1024)
            errors[key] = "O anexo excede o tamanho máximo de 10 MB.";
        }
        return;
      }
      if (el.type === "checkbox") {
        if (el.hasAttribute("required") && !form.querySelector('[name="' + el.name + '"]:checked')) {
          errors[key] = "Campo obrigatório.";
        }
        return;
      }
      if (el.hasAttribute("required") && !String(el.value || "").trim()) {
        errors[key] = "Campo obrigatório.";
      }
      if (el.type === "email" && el.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(el.value)) {
        errors[key] = "E-mail inválido.";
      }
    });
    return errors;
  }

  function buildFormData(form) {
    var fd = new FormData();
    var controls = form.querySelectorAll("input, select, textarea");
    controls.forEach(function (el) {
      if (!el.name) return;
      var key = fieldKey(el.name);
      if (el.type === "file") {
        if (el.files && el.files[0]) fd.append("anexo_pdf", el.files[0]);
      } else if (el.type === "checkbox" || el.type === "radio") {
        if (el.checked) fd.append(key, el.value || "on");
      } else {
        fd.append(key, el.value);
      }
    });
    return fd;
  }

  function toUrlEncoded(form) {
    var params = new URLSearchParams();
    form.querySelectorAll("input, select, textarea").forEach(function (el) {
      if (!el.name) return;
      var key = fieldKey(el.name);
      if (el.type === "checkbox" || el.type === "radio") {
        if (el.checked) params.append(key, el.value || "on");
      } else if (el.type !== "file") {
        params.append(key, el.value);
      }
    });
    return params;
  }

  function wire(form) {
    var hasFile = !!form.querySelector('input[type="file"]');
    var isContato = !hasFile && !!form.querySelector('[name="form_fields[message]"]');
    if (!hasFile && !isContato) return; // formulário desconhecido, ignora

    var endpoint = hasFile ? "/api/inscricao" : "/api/contato";

    // Bloqueia o handler do Elementor (fase de captura) e neutraliza listeners antigos
    form.addEventListener(
      "submit",
      function (ev) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        submit(form, endpoint, hasFile);
      },
      true
    );
  }

  function submit(form, endpoint, hasFile) {
    clearFieldErrors(form);
    var box = form.querySelector(".premio-msg");
    if (box) box.style.display = "none";

    var errors = clientValidate(form, hasFile);
    if (Object.keys(errors).length) {
      Object.keys(errors).forEach(function (k) {
        markFieldError(form, k, errors[k]);
      });
      showMsg(form, "error", "Por favor, corrija os campos destacados.");
      return;
    }

    var btn = form.querySelector('button[type="submit"], input[type="submit"], .elementor-button[type="submit"]');
    var btnHtml = btn ? btn.innerHTML : null;
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = "Enviando...";
    }

    var opts = { method: "POST" };
    if (hasFile) {
      opts.body = buildFormData(form);
    } else {
      opts.headers = { "Content-Type": "application/x-www-form-urlencoded" };
      opts.body = toUrlEncoded(form).toString();
    }

    fetch(endpoint, opts)
      .then(function (r) {
        return r.json().then(function (j) {
          return { status: r.status, body: j };
        });
      })
      .then(function (res) {
        if (res.status >= 200 && res.status < 300 && res.body.ok) {
          form.reset();
          if (hasFile) {
            // página de agradecimento existente no site
            showMsg(form, "success", (res.body.message || "Inscrição recebida com sucesso!") + " Redirecionando...");
            setTimeout(function () {
              window.location.href = "/obrigado/";
            }, 1200);
          } else {
            showMsg(form, "success", res.body.message || "Mensagem enviada com sucesso!");
          }
        } else if (res.body && res.body.errors) {
          Object.keys(res.body.errors).forEach(function (k) {
            markFieldError(form, k, res.body.errors[k]);
          });
          showMsg(form, "error", "Por favor, corrija os campos destacados.");
        } else {
          showMsg(form, "error", (res.body && res.body.message) || "Ocorreu um erro no envio. Tente novamente.");
        }
      })
      .catch(function () {
        showMsg(form, "error", "Falha de conexão. Verifique sua internet e tente novamente.");
      })
      .finally(function () {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = btnHtml;
        }
      });
  }

  function init() {
    document.querySelectorAll("form.elementor-form").forEach(wire);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
