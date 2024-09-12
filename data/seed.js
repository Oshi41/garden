async function install() {
    const res = await fetch('http://github.com/users');
    const seeds = await res.json();
}