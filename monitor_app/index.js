document.getElementById("get-btn").addEventListener("click", getUsers);

function getUsers() {
  fetch("/users")
    .then((response) => response.json())
    .then((data) => console.log("get response", data))
    .catch((error) => console.error("Error:", error));
}
