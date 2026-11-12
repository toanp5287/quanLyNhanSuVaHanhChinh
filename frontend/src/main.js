
import homeHtml from "./pages/home.html?raw";
import login from "./pages/login.html?raw";

const app = document.querySelector("#app");

function mountHome(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");

    document.body.className = doc.body.className;
    app.innerHTML = doc.body.innerHTML;

    // Khởi chạy lại các script trong HTML
    app.querySelectorAll("script").forEach((oldScript) => {
        const script = document.createElement("script");

        Array.from(oldScript.attributes).forEach((attr) => {
            script.setAttribute(attr.name, attr.value);
        });

        script.textContent = oldScript.textContent;
        oldScript.replaceWith(script);
    });
}


mountHome(login);


document.addEventListener("click", (e) => {
    const button = e.target.closest("#dangNhap");

    if (!button) return;

    e.preventDefault();


    mountHome(homeHtml);
});
