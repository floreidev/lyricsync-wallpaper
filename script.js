const searchURL = `https://music.xianqiao.wang/neteaseapiv2/search?limit=10&type=1&keywords=`;
const lyricURL = `https://music.xianqiao.wang/neteaseapiv2/lyric?id=`;
document.addEventListener("DOMContentLoaded", (ev) => {
    const lyricEl = document.getElementById("currentLyric")
    const titleEl = document.getElementById("title")
    const artistEl = document.getElementById("artist")
    const artEl = document.getElementById("art")
    const prevEl = document.getElementById("prevLyric")
    const nextEl = document.getElementById("nextLyric")
    var currentTimeouts = new Set();
    var skipaheadDelayFix = 850;

    function clearTimeouts() {
        currentTimeouts.forEach((v) => {
            clearTimeout(v);
        })
        currentTimeouts.clear();
    }

    function wallpaperMediaPropertiesListener(event) {
        const keywords = event.title.replace(/-\s+(feat|with|prod).*/i, "").replace(/(\(|\[)(feat|with|prod)\.?\s+.*(\)|\])$/i, "").trim().replace(/\s-\s.*/, "") + " " + event.artist
        const timestamp = Date.now();
        titleEl.textContent = event.title;
        artistEl.textContent = event.artist;
        clearTimeouts();
        findLyrics(keywords).then((r) => {
            clearTimeouts();
            const code = r[0]
            const response = r[1]
            switch (code) {
                case -2:
                    lyricEl.textContent = "An error occured: " + response
                    break;
                default:
                case -1:
                    lyricEl.textContent = "No lyrics found."
                    break;
                case 0:
                    clearTimeouts();
                    const lyr = getLyricsSynced(response);
                    var skipahead = Date.now() - timestamp;
                    lyricEl.textContent =  `${event.artist} - ${event.title} ${lyr.synced?"[Synced]":"[Unsynced]"}`
                    if(skipahead > 0) skipahead += skipaheadDelayFix;
                    if(lyr.synced) {
                        for(var lyric of lyr.synced) {
                            if(lyric.startTime - skipahead <= 0) continue;
                            addTimeout(lyric.startTime - skipahead, lyric.text, event.title);
                        }
                    }
                    break;
            }
        })

    }

    var mousePos = {
        x:4,y:4,
        oldX: 0, oldY: 0
    }


    function step(tmstmp) {
        var newX = lerp(mousePos.oldX, mousePos.x, glowLerpAlpha);
        var newY = lerp(mousePos.oldY, mousePos.y, glowLerpAlpha);
        mousePos.oldX = newX;
        mousePos.oldY = newY;
        document.getElementById("glowel").style.left = newX + "px"
        document.getElementById("glowel").style.top = newY + "px"
        window.requestAnimationFrame(step)
    }
    window.requestAnimationFrame(step)

    function lerp(a, b, t) {
        return a + t * (b - a)
    }
    var sclr = "#000";
    function wallpaperMediaThumbnailListener(event) {
        artEl.src = event.thumbnail;
        document.getElementById("glowel").style.boxShadow = `0px 0px ${glowBlur}px ${glowSpread}px ${event.secondaryColor}`
        sclr = event.secondaryColor;
        if(useBgc) {
            document.body.style.background = event.primaryColor;
            document.body.style.color = event.highContrastColor;
        }
    }
    window.wallpaperRegisterMediaThumbnailListener(wallpaperMediaThumbnailListener);
    var lastClick = -1;
    var clicks = 0;
    document.addEventListener("click", (ev) => {
        if(Date.now() - lastClick > 200) {
            lastClick = Date.now();
            return;
        } else {
            clicks++;
            if(clicks < 2) return;
            else clicks = 0
        }
        forceClearTimeouts();
        lyricEl.textContent = "Reset timeouts";
    })

    function forceClearTimeouts() {
        clearTimeouts();
        var mx = setTimeout(()=>{});
        for(var i = 0; i < mx; i ++) {
            clearTimeout(i);
        }
    }

    function addTimeout(tm, v,title) {
        var tmid = setTimeout(() => {
            if(titleHighlight)
            lyricEl.innerHTML = v.toLowerCase().replace(new RegExp(title.toLowerCase().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), "g"), (match) => {
                return `<span style="color:${sclr};">${match.toUpperCase()}</span>`
            })
            else lyricEl.textContent = v.toLowerCase();
        }, tm)
        currentTimeouts.add(tmid);
    }

    function getLyricsSynced(lyrics) {
        const lines = lyrics
            .replace(/\[[a-zA-Z]+:.+\]/g, "")
            .trim()
            .split("\n");
        const syncedTimestamp = /\[([0-9:.]+)\]/;
        const karaokeTimestamp = /\<([0-9:.]+)\>/;  
        const isSynced = lines[0].match(syncedTimestamp);
        const unsynced = [];
        const synced = isSynced ? [] : null;
        const isKaraoke = lines[0].match(karaokeTimestamp);
		const karaoke = isKaraoke ? [] : null;
        lines.forEach((line, i) => {
            const time = line.match(syncedTimestamp)?.[1];
            let lyricContent = line.replace(syncedTimestamp, "").trim();
            const lyric = lyricContent.replace(/\<([0-9:.]+)\>/g, "").trim();

            if (line.trim() !== "") {
                if (isKaraoke) {
                    if (!lyricContent.endsWith(">")) {
                        // For some reason there are a variety of formats for karaoke lyrics, Wikipedia is also inconsisent in their examples
                        const endTime = lines[i + 1]?.match(syncedTimestamp)?.[1] || this.formatTime(Number(Spicetify.Player.data.track.metadata.duration));
                        lyricContent += `<${endTime}>`;
                    }
                    const karaokeLine = parseKaraokeLine(lyricContent, time);
                    karaoke.push({ text: karaokeLine, startTime: timestampToMs(time) });
                }
                isSynced && time && synced.push({ text: lyric || "♪", startTime: timestampToMs(time) });
                unsynced.push({ text: lyric || "♪" });
            }
        });
        return {synced , unsynced, karaoke};
    }
    window.wallpaperRegisterMediaPropertiesListener(wallpaperMediaPropertiesListener);

    function timestampToMs(timestamp) {
        const [minutes, seconds] = timestamp.replace(/\[\]\<\>/, "").split(":");
        return Number(minutes) * 60 * 1000 + Number(seconds) * 1000;
    }

    function parseKaraokeLine(line, startTime) {
        let wordTime = timestampToMs(startTime);
        const karaokeLine = [];
        const karaoke = line.matchAll(/(\S+ ?)\<([0-9:.]+)\>/g);
        for (const match of karaoke) {
            const word = match[1];
            const time = match[2];
            karaokeLine.push({ word, time: timestampToMs(time) - wordTime });
            wordTime = timestampToMs(time);
        }
        return karaokeLine;
    }

    function findLyrics(keywords) {
        return new Promise((resolve, reject) => {
            fetch(searchURL + keywords).then((_) => _.json().then((resp) => {
                if (!resp || !resp.result || !resp.result.songs || resp.result.songs.length == 0) resolve([-1, {}]);
                const id = resp.result.songs[0].id
                fetch(lyricURL + id).then((__) => __.json().then((lyrics) => {
                    if (!lyrics.lrc || !lyrics.lrc.lyric) resolve([-1, {}]);
                    resolve([0, lyrics.lrc.lyric, resp.result.songs[0]]);
                })).catch((err) => resolve([-2, err]))
            })).catch((err) => resolve([-2, err]))
        })
    }
    var showDetails = false;
    var useBgc = false;
    var glowSpread = 32, glowBlur = 32, glowLerpAlpha = 0.1;

    document.addEventListener("mousemove", (ev) => {
        mousePos.x = ev.x;
        mousePos.y = ev.y;
    })
    var titleHighlight = true;
    window.wallpaperPropertyListener = {
        applyUserProperties: function(properties) {
            if (properties.delayfix) {
                skipaheadDelayFix = properties.delayfix.value;
            }
            if(properties.bgc) {
                var customColor = properties.bgc.value.split(' ');
                customColor = customColor.map(function(c) {
                    return Math.ceil(c * 255);
                });
                document.body.style.background = 'rgb(' + customColor + ')';
            }
            if(properties.fgc && !useBgc) {
                var customColor = properties.fgc.value.split(' ');
                customColor = customColor.map(function(c) {
                    return Math.ceil(c * 255);
                });
                document.body.style.color = 'rgb(' + customColor + ')';
            }
            if(properties.usebgc) useBgc = properties.usebgc.value;
            if(properties.details) {
                showDetails = properties.details.value;
                document.getElementById("info-container").style.display = (showDetails ? "flex" : "none");
            }
            if(properties.spread) glowSpread = properties.spread.value;
            if(properties.blur) glowBlur = properties.blur.value;
            if(properties.alpha) glowLerpAlpha = properties.alpha.value;
            if(properties.titleHighlight) titleHighlight = properties.titleHighlight.value;
        },
    };
})


