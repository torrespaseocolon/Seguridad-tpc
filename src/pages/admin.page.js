import { el, clear } from "../utils/dom.js";
import { icon } from "../utils/icons.js";
import { navigate } from "../router.js";
import { renderDashboardTab } from "./admin/dashboard.tab.js";
import { renderUsersTab } from "./admin/users.tab.js";
import { renderParkingConfigTab } from "./admin/parking-config.tab.js";
import { renderObjectsConfigTab } from "./admin/objects-config.tab.js";
import { renderAccessItemsAdminTab } from "./admin/access-items-admin.tab.js";
import { renderReportsTab } from "./admin/reports.tab.js";
import { renderCorrectionsTab } from "./admin/corrections.tab.js";
import { renderDemoTab } from "./admin/demo.tab.js";

const TABS = [
  { id: "dashboard", label: "Panel", render: renderDashboardTab },
  { id: "users", label: "Usuarios", render: renderUsersTab },
  { id: "parking", label: "Parqueos", render: renderParkingConfigTab },
  { id: "objects", label: "Objetos", render: renderObjectsConfigTab },
  { id: "access", label: "Tarjetas/Stickers", render: renderAccessItemsAdminTab },
  { id: "reports", label: "Reportes e historial", render: renderReportsTab },
  { id: "corrections", label: "Correcciones", render: renderCorrectionsTab },
  { id: "demo", label: "Demostración", render: renderDemoTab },
];

export function renderAdmin(root, params) {
  clear(root);
  root.appendChild(
    el("div", { class: "back-bar" }, [
      el("button", { class: "btn btn--secondary", onclick: () => navigate("/") }, [icon("back", { size: 18 }), " Menú"]),
      el("h2", { class: "row" }, [icon("admin"), "Administración"]),
    ])
  );

  const tabBar = el("div", { class: "row", style: "flex-wrap:wrap; margin-bottom:16px; gap:8px;" });
  const content = el("div", {});
  root.appendChild(tabBar);
  root.appendChild(content);

  let activeTab = params.get("tab") || "dashboard";
  let currentCleanup = null;

  function renderTabBar() {
    clear(tabBar);
    for (const tab of TABS) {
      tabBar.appendChild(
        el(
          "button",
          {
            class: `btn ${activeTab === tab.id ? "btn--primary" : "btn--secondary"}`,
            style: "min-height:40px; padding:8px 14px; font-size:14px;",
            onclick: () => selectTab(tab.id),
          },
          tab.label
        )
      );
    }
  }

  function selectTab(id) {
    if (typeof currentCleanup === "function") {
      try {
        currentCleanup();
      } catch (e) {
        /* ignore */
      }
      currentCleanup = null;
    }
    activeTab = id;
    renderTabBar();
    clear(content);
    const tab = TABS.find((t) => t.id === id);
    const result = tab.render(content);
    if (result && typeof result.then === "function") {
      result.then((cleanup) => {
        if (typeof cleanup === "function") currentCleanup = cleanup;
      });
    } else if (typeof result === "function") {
      currentCleanup = result;
    }
  }

  renderTabBar();
  selectTab(activeTab);

  return () => {
    if (typeof currentCleanup === "function") currentCleanup();
  };
}
