import { login as loginRequest } from "../services/auth.service.js";

const showError = (message) => {
  const errorBox = document.getElementById("loginError");
  if (!errorBox) return;

  errorBox.textContent = message;
  errorBox.classList.remove("hidden");
};

const hideError = () => {
  const errorBox = document.getElementById("loginError");
  if (!errorBox) return;

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

      if (window.__HRM_SPA__) {
        window.dispatchEvent(
          new CustomEvent("hrm:login-success", { detail: result.user }),
        );
      } else {
        window.location.href = "/";
      }
    } catch (error) {
      const message =
        error.response?.data?.message ||
        "Không thể kết nối máy chủ, vui lòng thử lại";
      showError(message);
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
