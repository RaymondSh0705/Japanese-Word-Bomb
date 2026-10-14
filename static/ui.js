// Shared localization and native dialogs (focus trapping and Escape built in).
function translateUI(language) {
    const chosen = language === "jp" ? "jp" : "en";
    document.documentElement.lang = chosen === "jp" ? "ja" : "en";
    document.querySelectorAll("[data-en][data-jp]").forEach(el => {
        el.textContent = el.dataset[chosen];
    });
}
translateUI(localStorage.getItem("lang"));
function bindDialog(dialog, trigger, closeButton) {
    trigger.addEventListener("click", () => dialog.showModal());
    closeButton.addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", event => {
        const rect = dialog.getBoundingClientRect();
        if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
    });
}
