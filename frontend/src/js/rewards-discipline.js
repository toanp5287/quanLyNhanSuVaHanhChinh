// Micro-interaction: Checkbox batch toggling and row hover state feedback
document.addEventListener("DOMContentLoaded", function () {
  const mainCheckbox = document.querySelector('thead input[type="checkbox"]');
  const rowCheckboxes = document.querySelectorAll(
    'tbody input[type="checkbox"]',
  );

  if (mainCheckbox) {
    mainCheckbox.addEventListener("change", function () {
      rowCheckboxes.forEach((cb) => {
        cb.checked = mainCheckbox.checked;
      });
    });
  }
});
