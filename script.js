// 1. Array of cute, positive messages
const cuteQuotes = [
    "You are doing wonderful today! Keep shining. ✨",
    "Don't forget to drink some water and stretch! 🥤",
    "You look lovely today! Remember to smile. 🌸",
    "Small steps still move you forward. Go you! 🐢",
    "Mistakes just mean you are learning and growing. 🌱",
    "You bring so much joy into the world! 🎈"
];

const quoteElement = document.getElementById('quote');
const quoteButton = document.getElementById('quote-btn');

// 2. Change the quote randomly on click
quoteButton.addEventListener('click', () => {
    const randomIndex = Math.floor(Math.random() * cuteQuotes.length);
    quoteElement.textContent = cuteQuotes[randomIndex];
});

// 3. Dynamic custom response generator based on selected mood
function pickMood(mood) {
    const replyElement = document.getElementById('mood-reply');
    
    if (mood.includes('Happy')) {
        replyElement.textContent = "Yay! Your joy is absolutely contagious! 🥳";
    } else if (mood.includes('Sleepy')) {
        replyElement.textContent = "Time to wrap yourself like a cozy burrito. 🌯💤";
    } else if (mood.includes('Hungry')) {
        replyElement.textContent = "Go grab your favorite delicious treat! 🍰✨";
    }
}
