import "./styles.css";
import { initGiftDrop } from "./giftdrop.js";
import { firebaseConfig, analyticsReady } from "./firebase.js";

initGiftDrop();

// Firebase status chip
const chip = document.getElementById("firebaseChip");
analyticsReady
  .then((analytics) => {
    chip.innerHTML =
      '<span class="dot on"></span> Firebase: ' +
      firebaseConfig.projectId +
      (analytics ? " · analytics active" : " · analytics unavailable");
  })
  .catch(() => {
    chip.innerHTML = '<span class="dot off"></span> Firebase: offline';
  });
