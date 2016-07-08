let canvas = document.getElementsByTagName("canvas")[0];
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let accuracy = 5;
let gravity = -0.02;
let clothX = 100;
let clothY = 40;
let spacing = 1.8 / clothX;
let tearDist = spacing * 6;
let friction = 0.99;
let bounce = 0.5;
let startX = -0.9;
let startY = 1.0;
let gl = undefined;

class Point {
    constructor(x, y, z) {
        this.x = this.px = x;
        this.y = this.py = y;
        this.z = this.pz = z;

        this.vx = this.vy = this.vz = 0;

        this.pinX = this.pinY = null;

        this.constraints = []
    }

    update(delta) {
        if (this.pinX && this.pinY) return this;

        if (mouse.down) {
            let dx = this.x - mouse.x;
            let dy = this.y - mouse.y;
            let dist = Math.sqrt(dx * dx + dy * dy);

            if (mouse.button === 1 && dist < mouse.influence) {
                this.px = this.x - (mouse.x - mouse.px);
                this.py = this.y - (mouse.y - mouse.py);
            } else if (dist < mouse.cut) {
                this.free();
            }
        }

        this.addForce(0, gravity, 0);

        let nx = this.x + (this.x - this.px) * friction + this.vx * delta;
        let ny = this.y + (this.y - this.py) * friction + this.vy * delta;

        this.px = this.x;
        this.py = this.y;

        this.x = nx;
        this.y = ny;

        this.vy = this.vx = 0;

        if (this.x >= 1) {
            this.px = 1 + (1 - this.px) * bounce;
            this.x = 1;
        }

        if (this.y >= 1) {
            this.py = 1 + (1 - this.py) * bounce;
            this.y = 1;
        } else if (this.y <= -1.0) {
            this.py *= -1.0 * bounce;
            this.y = -1.0;
        }

        return this;
    }

    resolve() {
        if (this.pinX && this.pinY) {
            this.x = this.pinX;
            this.y = this.pinY;
            return;
        }

        this.constraints.forEach((constraint) => constraint.resolve());
    }

    attach(point) {
        this.constraints.push(new Constraint(this, point));
    }

    free() {
        this.constraints = [];
        cloth.removeIndex(this);
    }

    addForce(x, y, z) {
        this.vx += x || 0;
        this.vy += y || 0;
        this.vz += z || 0;
    }

    pin(pinx, piny) {
        this.pinX = pinx
        this.pinY = piny
    }
}

class Constraint {
    constructor(p1, p2) {
        this.p1 = p1;
        this.p2 = p2;
        this.length = spacing;
    }

    resolve() {
        let dx = this.p1.x - this.p2.x;
        let dy = this.p1.y - this.p2.y;
        let dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < this.length) return;

        let diff = (this.length - dist) / dist;

        if (dist > tearDist) this.p1.free();

        let mul = diff * 0.5 * (1 - this.length / dist);

        let px = dx * mul;
        let py = dy * mul;

        if (!this.p1.pinX) this.p1.x += px;
        if (!this.p1.pinY) this.p1.y += py;

        if (!this.p2.pinX) this.p2.x -= px;
        if (!this.p2.pinY) this.p2.y -= py;

        return this;
    }
}

class Cloth {
    constructor() {
        this.vertices = new Float32Array(((clothX + 1) * (clothY + 1)) * 3);
        this.indices = new Uint32Array(this.vertices.length * 3);
        this.points = [];

        let cnt = 0;
        for (let y = 0; y <= clothY; y++) {
            for (let x = 0; x <= clothX; x++) {
                let p = new Point(startX + x * spacing, startY - y * spacing, 0.0);

                y === 0 && p.pin(p.x, p.y);
                x !== 0 && p.attach(this.points[this.points.length - 1]);
                y !== 0 && p.attach(this.points[x + (y - 1) * (clothX + 1)]);

                if (x !== clothX && y !== clothY) {
                    let b = cnt;
                    cnt *= 2;

                    this.indices[cnt++] = this.points.length;
                    this.indices[cnt++] = this.points.length + 1;
                    this.indices[cnt++] = this.points.length + clothX + 1;
                    this.indices[cnt++] = this.points.length + 1;
                    this.indices[cnt++] = this.points.length + clothX + 1;
                    this.indices[cnt++] = this.points.length + clothX + 2;

                    cnt = b;
                }

                this.points.push(p);
                this.vertices[cnt++] = p.x;
                this.vertices[cnt++] = p.y;
                this.vertices[cnt++] = p.z;
            }
        }
    }

    removeIndex(p) {
        let pos = this.points.indexOf(p);

        let pp = [
            this.points[pos - clothX - 2],  // top-left
            this.points[pos - clothX - 1],  // top-mid
            this.points[pos - 1],           // mid-left
            this.points[pos + 1],           // mid-right
            this.points[pos + clothX],      // bot-left
            this.points[pos + clothX + 1],  // bot-mid
            this.points[pos + clothX + 2]   // bot-right
        ];

        let ppp = [
            pos - clothX - 2,
            pos - clothX - 1,
            pos - 1,
            pos + 1,
            pos + clothX,
            pos + clothX + 1,
            pos + clothX + 2
        ];

        let cnt = p * 6;

        this.indices[cnt++] = pp[0] + 1;
        this.indices[cnt++] = pp[0] + clothX + 1;
        this.indices[cnt++] = pp[0] + clothX + 2;
        this.indices[cnt++] = this.indices[cnt++] = this.indices[cnt++] = null;

        cnt = ppp[0] * 6;

        this.indices[cnt++] = pp[0];
        this.indices[cnt++] = pp[0] + 1;
        this.indices[cnt++] = pp[0] + clothX + 1;
        this.indices[cnt++] = this.indices[cnt++] = this.indices[cnt++] = null;

        cnt = ppp[1] * 6;

        this.indices[cnt++] = pp[0];
        this.indices[cnt++] = pp[0] + 1;
        this.indices[cnt++] = pp[0] + clothX + 2;
        this.indices[cnt++] = this.indices[cnt++] = this.indices[cnt++] = null;

        cnt = ppp[2] * 6;

        this.indices[cnt++] = pp[0];
        this.indices[cnt++] = pp[0] + clothX + 1;
        this.indices[cnt++] = pp[0] + clothX + 2;
        this.indices[cnt++] = this.indices[cnt++] = this.indices[cnt++] = null;

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indicesbuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, cloth.indices, gl.STATIC_DRAW);
    }

    update(delta) {
        let i = accuracy;

        while (i--) {
            this.points.forEach((point) => {
                point.resolve();
            });
        }

        let cnt = 0;
        this.points.forEach((point) => {
            point.update(delta);
            this.vertices[cnt++] = point.x;
            this.vertices[cnt++] = point.y;
            this.vertices[cnt++] = point.z;
        });
    }
}

let mouse = {
    cut: 0.02,
    influence: 0.08,
    down: false,
    button: 1,
    x: 0,
    y: 0,
    px: 0,
    py: 0
}

function setMouse(e) {
    let rect = canvas.getBoundingClientRect();
    mouse.px = mouse.x;
    mouse.py = mouse.y;
    mouse.x = (e.x - rect.left) / canvas.width;
    mouse.y = (canvas.height - (e.y - rect.top)) / canvas.height;
    mouse.x = (mouse.x * 2.0) - 1.0;
    mouse.y = (mouse.y * 2.0) - 1.0;
}

canvas.onmousedown = (e) => {
    mouse.button = e.which;
    mouse.down = true;
    setMouse(e);
}

canvas.onmousemove = setMouse;
canvas.onmouseup = () => (mouse.down = false);
canvas.oncontextmenu = (e) => e.preventDefault();

let cloth = new Cloth();

/////////////////////////////////////////////
// RENDERER
/////////////////////////////////////////////
try {
    gl = canvas.getContext('webgl');

    let EXT = gl.getExtension("OES_element_index_uint") ||
        gl.getExtension("MOZ_OES_element_index_uint") ||
        gl.getExtension("WEBKIT_OES_element_index_uint");

    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    //    gl.enable(gl.DEPTH_TEST);
    //    gl.depthFunc(gl.LESS);
    //    gl.enable(gl.CULL_FACE);
} catch (e) {
    console.error("It does not appear your computer can support WebGL.");
}

function CreateViewMatrix(position, direction, up) {
    let f = direction;
    let len = Math.sqrt(f[0] * f[0] + f[1] * f[1] + f[2] * f[2]);
    f = [f[0] / len, f[1] / len, f[2] / len];

    let s = [
        up[1] * f[2] - up[2] * f[1],
        up[2] * f[0] - up[0] * f[2],
        up[0] * f[1] - up[1] * f[0]
    ];

    len = Math.sqrt(s[0] * s[0] + s[1] * s[1] + s[2] * s[2]);

    let s_norm = [
        s[0] / len,
        s[1] / len,
        s[2] / len
    ];

    let u = [
        f[1] * s_norm[2] - f[2] * s_norm[1],
        f[2] * s_norm[0] - f[0] * s_norm[2],
        f[0] * s_norm[1] - f[1] * s_norm[0]
    ];

    let p = [
        -position[0] * s_norm[0] - position[1] * s_norm[1] - position[2] * s_norm[2],
        -position[0] * u[0] - position[1] * u[1] - position[2] * u[2],
        -position[0] * f[0] - position[1] * f[1] - position[2] * f[2]
    ];

    return [
        s_norm[0], u[0], f[0], 0.0,
        s_norm[1], u[1], f[1], 0.0,
        s_norm[2], u[2], f[2], 0.0,
        p[0], p[1], p[2], 1.0
    ];
}

function CreateOrthoMatrix(l, r, b, t, n, f) {
    let result = [];

    result[0] = 2 / (r - l);
    result[1] = 0;
    result[2] = 0;
    result[3] = -(r + l) / (r - l);

    result[4] = 0;
    result[5] = 2 / (t - b);
    result[6] = 0;
    result[7] = -(t + b) / (t - b);

    result[8] = 0;
    result[9] = 0;
    result[10] = -2 / (f - n);
    result[11] = -(f + n) / (f - n);

    result[12] = 0;
    result[13] = 0;
    result[14] = 0;
    result[15] = 1;

    return result;
}
let orthoMatrix = CreateOrthoMatrix(-1.0, 1.0, -1.0, 1.0, 0.1, 1024.0);
var viewMatrix = CreateViewMatrix([0.0, 0.0, 0.0], [0.0, 0.0, 1.0], [0.0, 1.0, 0.0]);

let vertexShader = gl.createShader(gl.VERTEX_SHADER);
gl.shaderSource(vertexShader, fetchHTTP("./shaders/vert.glsl"));
gl.compileShader(vertexShader);

let fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
gl.shaderSource(fragmentShader, fetchHTTP("./shaders/frag.glsl"));
gl.compileShader(fragmentShader);

let program = gl.createProgram();
gl.attachShader(program, vertexShader);
gl.attachShader(program, fragmentShader);
gl.linkProgram(program);
gl.useProgram(program);

let orthoMatrixID = gl.getUniformLocation(program, "u_ortho");
let modelMatrixID = gl.getUniformLocation(program, "u_model");
let viewMatrixID = gl.getUniformLocation(program, "u_view");
let timeID = gl.getUniformLocation(program, "u_time");
let resolutionID = gl.getUniformLocation(program, "u_resolution");
let a_PostionID = gl.getAttribLocation(program, "a_position");

let indicesbuffer = gl.createBuffer();
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indicesbuffer);
gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, cloth.indices, gl.STATIC_DRAW);

gl.uniform2f(resolutionID, canvas.width, canvas.height);
gl.uniformMatrix4fv(orthoMatrixID, false, orthoMatrix);
gl.uniformMatrix4fv(viewMatrixID, false, viewMatrix);
gl.uniformMatrix4fv(modelMatrixID, false, [
    1.0, 0.0, 0.0, 0.0,
    0.0, 1.0, 0.0, 0.0,
    0.0, 0.0, 1.0, 0.0,
    0.0, 0.0, 0.0, 1.0
]);

// @mrdoob Performance Monitor
let stats = new Stats();
stats.showPanel(0);
document.body.appendChild(stats.dom);

let loadTime = Date.now();
let lastTime = loadTime;
let nbFrames = 0;
let vertexbuffer = gl.createBuffer();

let render_mode = gl.POINTS;
document.addEventListener("keypress", function (key) {
    if (key.key === 'w') {
        render_mode = render_mode === gl.POINTS ? gl.TRIANGLES : gl.POINTS;
    } else if (key.key === 'g') {
        gravity = gravity ? 0 : -0.02;
    } else if (key.key === 'r') {
        cloth = new Cloth();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indicesbuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, cloth.indices, gl.STATIC_DRAW);
    }
});

function render() {
    let currentTime = Date.now();
    nbFrames++;
    if (currentTime - lastTime >= 1000.0) {
        console.log(1000.0 / nbFrames + " ms/frame");
        nbFrames = 0;
        lastTime += 1000.0;
    }

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // 1st attribute buffer : vertices
    gl.enableVertexAttribArray(a_PostionID);
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexbuffer);
    gl.bufferData(gl.ARRAY_BUFFER, cloth.vertices, gl.STATIC_DRAW);
    gl.vertexAttribPointer(a_PostionID, 3, gl.FLOAT, false, 0, 0);

    // Time Uniform
    gl.uniform1f(timeID, (currentTime - loadTime) / 1000.0);

    gl.drawElements(render_mode, cloth.indices.length, gl.UNSIGNED_INT, 0);
    gl.flush();
}

(function update() {
    stats.begin();

    cloth.update(0.032);
    render();

    stats.end();

    window.requestAnimFrame(update);
})();
