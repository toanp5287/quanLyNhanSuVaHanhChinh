import { login as loginRequest } from "../services/auth.service.js";
import { LOGIN_IP_BLOCK_KEY } from "../services/api.js";

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char],
  );

const showError = (message, options = {}) => {
  const errorBox = document.getElementById("loginError");
  if (!errorBox) return;
  errorBox.innerHTML = "";
  errorBox.textContent = message;
  if (options.clientIp) {
    const meta = document.createElement("div");
    meta.className = "mt-1 text-[12px] flex items-center gap-2";
    meta.innerHTML = `<span>IP hiện tại: <strong>${escapeHtml(options.clientIp)}</strong></span>`;
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "underline";
    copy.textContent = "Copy IP";
    copy.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(options.clientIp); copy.textContent = "Đã copy"; } catch { copy.textContent = "Không copy được"; }
    });
    meta.appendChild(copy);
    errorBox.appendChild(meta);
  }
  errorBox.classList.remove("hidden");
};

const hideError = () => {
  const errorBox = document.getElementById("loginError");
  if (!errorBox) return;
  errorBox.innerHTML = "";
  errorBox.textContent = "";
  errorBox.classList.add("hidden");
};

export const initLogin = () => {
  const form = document.getElementById("loginForm");
  if (!form || form.dataset.bound === "1") return;

  form.dataset.bound = "1";

  const passwordInput = document.getElementById("password");
  const toggleButton = document.getElementById("togglePassword");
  const eyeIcon = document.getElementById("eyeIcon");
  const eyeOffIcon = document.getElementById("eyeOffIcon");

  if (passwordInput && toggleButton) {
    toggleButton.addEventListener("click", () => {
      const show = passwordInput.type === "password";
      passwordInput.type = show ? "text" : "password";
      toggleButton.setAttribute("aria-label", show ? "Ẩn mật khẩu" : "Hiện mật khẩu");
      eyeIcon?.classList.toggle("hidden", show);
      eyeOffIcon?.classList.toggle("hidden", !show);
      passwordInput.focus();
    });
  }

  const blockedRaw = sessionStorage.getItem(LOGIN_IP_BLOCK_KEY);
  if (blockedRaw) {
    try {
      const blocked = JSON.parse(blockedRaw);
      showError(blocked.message || "IP hiện tại không được phép đăng nhập.", { clientIp: blocked.clientIp });
    } catch {}
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideError();

    const identifier = form.querySelector("#identifier")?.value.trim() || "";
    const password = form.querySelector("#password")?.value || "";
    const submitButton = document.getElementById("dangNhap");

    if (!identifier || !password) {
      showError("Vui lòng nhập mã nhân viên hoặc email và mật khẩu");
      return;
    }

    const originalContent = submitButton?.innerHTML;

    try {
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.classList.add("opacity-70", "cursor-not-allowed");
        submitButton.innerHTML = "<span>ĐANG ĐĂNG NHẬP...</span>";
      }

      const result = await loginRequest(identifier, password);
      sessionStorage.removeItem(LOGIN_IP_BLOCK_KEY);

      if (window.__HRM_SPA__) {
        window.dispatchEvent(new CustomEvent("hrm:login-success", { detail: result.user }));
      } else {
        window.location.href = "/";
      }
    } catch (error) {
      const data = error.response?.data || {};
      const message = data.message || "Không thể kết nối máy chủ, vui lòng thử lại";
      showError(message, data.code === "LOGIN_IP_NOT_ALLOWED" ? { clientIp: data.clientIp } : {});
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.classList.remove("opacity-70", "cursor-not-allowed");
        submitButton.innerHTML = originalContent;
      }
    }
  });
};

if (!window.__HRM_SPA__) {
  initLogin();
}
