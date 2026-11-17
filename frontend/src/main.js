import homeHtml from "./pages/home.html?raw";
import loginHtml from "./pages/login.html?raw";
import { initLogin } from "./js/login.js";
import { initHome, setupShell } from "./js/home.js";
import { initPermissions } from "./js/permissions.js";
import { initMyProfile } from "./js/my-profile.js";
import { initChamCong } from "./js/cham-cong.js";
import { initFaceKiosk } from "./js/diem-danh-nhat-ky-quet-the-phan-ca.js";
import { getEmployeeModeFromHash, initEmployees } from "./js/employees.js";
import {
  getContractStatusFromHash,
  initContracts,
} from "./js/contracts.js";
import {
  getOrganizationTabFromHash,
  initOrganization,
} from "./js/organization.js";
import {
  clearSession,
  getCurrentUser,
  getMe,
  getToken,
  hasPermission,
  logout,
} from "./services/auth.service.js";

window.__HRM_SPA__ = true;

const app = document.querySelector("#app");

const transitionStyle = document.createElement("style");
transitionStyle.textContent = `
  @keyframes hrm-fade-out { from { opacity: 1; } to { opacity: 0; } }
  @keyframes hrm-fade-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
  .hrm-fade-out { animation: hrm-fade-out .25s ease forwards; }
  .hrm-fade-in { animation: hrm-fade-in .4s ease; }
`;
document.head.appendChild(transitionStyle);

function mountPage(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");

  document.body.className = doc.body.className;
  app.innerHTML = doc.body.innerHTML;

  app.querySelectorAll("script").forEach((oldScript) => {
    if (oldScript.src) return;

    const script = document.createElement("script");
    Array.from(oldScript.attributes).forEach((attr) => {
      script.setAttribute(attr.name, attr.value);
    });

    script.textContent = oldScript.textContent;
    oldScript.replaceWith(script);
  });
}

function showLogin() {
  mountPage(loginHtml);
  initLogin();
  const link = document.createElement("a");
  link.href = "#/face-id";
  link.className = "fixed bottom-6 right-6 z-50 rounded-xl bg-primary text-white px-5 py-3 shadow-lg font-semibold";
  link.textContent = "Điểm danh FaceID • Không cần đăng nhập";
  app.appendChild(link);
}

function showHome(user) {
  mountPage(homeHtml);
  app.classList.add("hrm-fade-in");
  initHome(user || getCurrentUser());
}

function transitionTo(render) {
  app.classList.add("hrm-fade-out");
  window.setTimeout(() => {
    render();
    app.classList.remove("hrm-fade-out");
    app.classList.add("hrm-fade-in");
  }, 250);
}

const clearHash = () => {
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${window.location.search}`,
  );
};

function showPermissions(user) {
  if (!user || user.role_id !== "SUPER_ADMIN") {
    clearHash();
    showHome(user);
    return;
  }

  mountPage(homeHtml);
  setupShell(user);
  initPermissions(user);
}

function showMyProfile(user) {
  if (!user || !hasPermission("ESS.SELF_PROFILE", user)) {
    clearHash();
    showHome(user);
    return;
  }

  mountPage(homeHtml);
  app.classList.add("hrm-fade-in");
  initMyProfile(user);
}

function showDiemDanh(user, tab = "daily") {
  if (!user || !hasPermission("ATT.VIEW", user)) {
    clearHash();
    showHome(user);
    return;
  }
  mountPage(homeHtml);
  setupShell(user);
  app.classList.add("hrm-fade-in");
  initChamCong(user, tab);
}

function showEmployees(user, mode = "all") {
  if (!user || !hasPermission("HR.PROFILE_VIEW", user)) {
    clearHash();
    showHome(user);
    return;
  }

  if (user.data_scope === "SELF") {
    window.location.hash = "#/ho-so-ca-nhan";
    return;
  }

  mountPage(homeHtml);
  app.classList.add("hrm-fade-in");
  setupShell(user);
  initEmployees(user, mode);
}

function showOrganization(user, tab = "chart") {
  if (!user || !hasPermission("HR.PROFILE_VIEW", user)) {
    clearHash();
    showHome(user);
    return;
  }

  if (user.data_scope === "SELF") {
    window.location.hash = "#/ho-so-ca-nhan";
    return;
  }

  mountPage(homeHtml);
  app.classList.add("hrm-fade-in");
  setupShell(user);
  initOrganization(user, tab);
}

function showContracts(user, status = "ALL") {
  if (!user || !hasPermission("HR.CONTRACT_MANAGE", user)) {
    clearHash();
    showHome(user);
    return;
  }

  mountPage(homeHtml);
  app.classList.add("hrm-fade-in");
  setupShell(user);
  initContracts(user, status);
}

function renderRoute(user) {
  const hash = window.location.hash;

  if (hash === "#/face-id") {
    initFaceKiosk();
  } else if (hash === "#/phan-quyen") {
    showPermissions(user);
  } else if (
    hash === "#/so-do-phong-ban" ||
    hash.startsWith("#/so-do-phong-ban/")
  ) {
    showOrganization(user, getOrganizationTabFromHash(hash));
  } else if (hash === "#/hop-dong" || hash.startsWith("#/hop-dong/")) {
    showContracts(user, getContractStatusFromHash(hash));
  } else if (hash === "#/nhan-vien" || hash.startsWith("#/nhan-vien/")) {
    showEmployees(user, getEmployeeModeFromHash(hash));
  } else if (hash === "#/ho-so-ca-nhan") {
    showMyProfile(user);
  } else if (hash === "#/diem-danh") {
    showDiemDanh(user);
  } else if (hash === "#/cham-cong" || hash === "#/cham-cong/thang") {
    showDiemDanh(user, "monthly");
  } else if (hash === "#/trang-chu") {
    showHome(user);
  } else if (!hash && user?.role_id === "EMPLOYEE") {
    showMyProfile(user);
  } else {
    showHome(user);
  }
}

document.addEventListener("click", (event) => {
  const card = event.target.closest(".action-card");

  if (card && !event.target.closest("button")) {
    const title = card.getAttribute("data-title") || "";
    const cardRoutes = {
       "Cổng thông tin cá nhân": "#/ho-so-ca-nhan",
       "Hồ sơ cá nhân & JD": "#/ho-so-ca-nhan",
       "Dữ liệu máy chấm công": "#/diem-danh",
        "Bảng chấm công tháng": "#/cham-cong/thang",
      "Tất cả nhân viên": "#/nhan-vien",
      "Nhân viên đang làm": "#/nhan-vien/dang-lam",
      "Nhân viên đã nghỉ": "#/nhan-vien/da-nghi",
      "Hợp đồng lao động": "#/hop-dong",
      "Sơ đồ phòng ban": "#/so-do-phong-ban",
    };

    if (cardRoutes[title]) {
      event.preventDefault();
      window.location.hash = cardRoutes[title];
      return;
    }
  }

  const link = event.target.closest("aside nav a[data-path]");
  if (!link) return;

  event.preventDefault();

  const path = link.getAttribute("data-path");

  if (path === "nhan-su") {
    const user = getCurrentUser();
    window.location.hash =
      user?.data_scope === "SELF" ? "#/ho-so-ca-nhan" : "#/nhan-vien";
    return;
  }

  if (path === "phan-quyen") {
    window.location.hash = "#/phan-quyen";
    return;
  }

  if (path === "menu-launcher") {
    window.location.hash = "#/trang-chu";
  }
});

window.addEventListener("hashchange", () => {
  const user = getCurrentUser();

  if (window.location.hash === "#/face-id") { initFaceKiosk(); return; }

  if (!user) {
    showLogin();
    return;
  }

  renderRoute(user);
});

window.addEventListener("hrm:login-success", (event) => {
  if (window.location.hash) {
    clearHash();
  }

  transitionTo(() => showHome(event.detail));
});

const showLogoutConfirm = (onConfirm) => {
  document.getElementById("hrmLogoutConfirm")?.remove();

  const overlay = document.createElement("div");
  overlay.id = "hrmLogoutConfirm";
  overlay.className =
    "fixed inset-0 z-[200] flex items-center justify-center bg-black/40";
  overlay.innerHTML = `
    <div class="bg-surface-container-lowest rounded-lg shadow-xl w-[320px] p-space-lg flex flex-col gap-space-md">
      <div class="flex items-center gap-space-sm">
        <span class="w-9 h-9 rounded bg-error-container text-on-error-container flex items-center justify-center shrink-0">
          <span class="material-symbols-outlined text-[20px]">logout</span>
        </span>
        <div>
          <p class="font-headline-sm text-headline-sm font-bold text-on-surface">Đăng xuất</p>
          <p class="font-body-sm text-body-sm text-on-surface-variant">Bạn có chắc chắn muốn đăng xuất?</p>
        </div>
      </div>
      <div class="flex justify-end gap-space-xs">
        <button type="button" data-logout-cancel class="h-9 px-space-md rounded text-on-surface-variant hover:bg-surface-container-high font-label-lg text-label-lg transition-colors">Hủy</button>
        <button type="button" data-logout-confirm class="h-9 px-space-md rounded bg-error text-on-error hover:opacity-90 font-label-lg text-label-lg transition-opacity">Đăng xuất</button>
      </div>
    </div>
  `;

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay || event.target.closest("[data-logout-cancel]")) {
      overlay.remove();
      return;
    }

    if (event.target.closest("[data-logout-confirm]")) {
      overlay.remove();
      onConfirm();
    }
  });

  document.body.appendChild(overlay);
};

window.addEventListener("hrm:logout-request", () => {
  showLogoutConfirm(() => {
    clearHash();
    transitionTo(() => {
      logout();
    });
  });
});

async function bootstrap() {
  if (window.location.hash === "#/face-id") { initFaceKiosk(); return; }
  if (!getToken()) {
    showLogin();
    return;
  }

  try {
    const user = await getMe();
    renderRoute(user);
  } catch {
    clearSession();
    showLogin();
  }
}

bootstrap();
