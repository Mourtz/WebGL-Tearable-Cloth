let canvas = document.getElementsByTagName("canvas")[0];
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// Configuration object for better maintainability
const config = {
    accuracy: 5,
    gravity: -0.02,
    clothX: 100,
    clothY: 40,
    friction: 0.99,
    bounce: 0.5,
    startX: -0.9,
    startY: 1.0,
    mouse: {
        cut: 0.02,
        influence: 0.08
    }
};

let spacing = 1.8 / config.clothX;
let tearDist = spacing * 6;
let gl = undefined;

// Async fetch function for better performance
async function fetchHTTP(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.text();
    } catch (error) {
        console.error('Failed to fetch:', url, error);
        return null;
    }
}

// Provides requestAnimationFrame in a cross browser way.
window.requestAnimFrame =
    window.requestAnimationFrame ||
    window.webkitRequestAnimationFrame ||
    window.mozRequestAnimationFrame ||
    window.oRequestAnimationFrame ||
    window.msRequestAnimationFrame ||
    function (callback) {
        window.setTimeout(callback, 1e3 / 60);
    };
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

            if (mouse.button === 1 && dist < config.mouse.influence) {
                this.px = this.x - (mouse.x - mouse.px);
                this.py = this.y - (mouse.y - mouse.py);
            } else if (dist < config.mouse.cut) {
                this.free();
            }
        }

        this.addForce(0, config.gravity, 0);

        let nx = this.x + (this.x - this.px) * config.friction + this.vx * delta;
        let ny = this.y + (this.y - this.py) * config.friction + this.vy * delta;

        this.px = this.x;
        this.py = this.y;

        this.x = nx;
        this.y = ny;

        this.vy = this.vx = 0;

        // Boundary collision with proper bounce
        if (this.x >= 1) {
            this.px = 1 + (1 - this.px) * config.bounce;
            this.x = 1;
        } else if (this.x <= -1) {
            this.px = -1 + (-1 - this.px) * config.bounce;
            this.x = -1;
        }

        if (this.y >= 1) {
            this.py = 1 + (1 - this.py) * config.bounce;
            this.y = 1;
        } else if (this.y <= -1.0) {
            this.py = -1.0 + (-1.0 - this.py) * config.bounce;
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
        // Remove this point from all constraints that reference it
        this.constraints.forEach(constraint => {
            // Remove this constraint from the other point
            const otherPoint = constraint.p1 === this ? constraint.p2 : constraint.p1;
            const index = otherPoint.constraints.indexOf(constraint);
            if (index > -1) {
                otherPoint.constraints.splice(index, 1);
            }
        });
        this.constraints = [];
        cloth.markForRemoval(this);
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
        this.vertices = new Float32Array(((config.clothX + 1) * (config.clothY + 1)) * 3);
        this.indices = [];
        this.points = [];
        this.removedPoints = new Set();
        this.needsIndexUpdate = false;

        let cnt = 0;
        for (let y = 0; y <= config.clothY; y++) {
            for (let x = 0; x <= config.clothX; x++) {
                let p = new Point(
                    config.startX + x * spacing, 
                    config.startY - y * spacing, 
                    0.0
                );

                // Pin the top row
                if (y === 0) p.pin(p.x, p.y);
                
                // Connect to left neighbor
                if (x !== 0) p.attach(this.points[this.points.length - 1]);
                
                // Connect to top neighbor
                if (y !== 0) p.attach(this.points[x + (y - 1) * (config.clothX + 1)]);

                this.points.push(p);
                this.vertices[cnt++] = p.x;
                this.vertices[cnt++] = p.y;
                this.vertices[cnt++] = p.z;
            }
        }

        this.generateIndices();
    }

    generateIndices() {
        this.indices = [];
        for (let y = 0; y < config.clothY; y++) {
            for (let x = 0; x < config.clothX; x++) {
                let i = x + y * (config.clothX + 1);
                
                // Skip removed points
                if (this.removedPoints.has(i) || 
                    this.removedPoints.has(i + 1) || 
                    this.removedPoints.has(i + config.clothX + 1) ||
                    this.removedPoints.has(i + config.clothX + 2)) {
                    continue;
                }

                // First triangle
                this.indices.push(i, i + 1, i + config.clothX + 1);
                // Second triangle
                this.indices.push(i + 1, i + config.clothX + 1, i + config.clothX + 2);
            }
        }
        this.needsIndexUpdate = true;
    }

    markForRemoval(point) {
        let index = this.points.indexOf(point);
        if (index !== -1) {
            this.removedPoints.add(index);
            this.generateIndices();
        }
    }

    update(delta) {
        let i = config.accuracy;

        while (i--) {
            this.points.forEach((point) => {
                if (!this.removedPoints.has(this.points.indexOf(point))) {
                    point.resolve();
                }
            });
        }

        let cnt = 0;
        this.points.forEach((point, index) => {
            if (!this.removedPoints.has(index)) {
                point.update(delta);
            }
            this.vertices[cnt++] = point.x;
            this.vertices[cnt++] = point.y;
            this.vertices[cnt++] = point.z;
        });
    }
}

let mouse = {
    cut: config.mouse.cut,
    influence: config.mouse.influence,
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
    mouse.x = ((e.clientX - rect.left) / canvas.width) * 2.0 - 1.0;
    mouse.y = ((canvas.height - (e.clientY - rect.top)) / canvas.height) * 2.0 - 1.0;
}

canvas.onmousedown = (e) => {
    mouse.button = e.which;
    mouse.down = true;
    setMouse(e);
}

canvas.onmousemove = setMouse;
canvas.onmouseup = () => (mouse.down = false);
canvas.oncontextmenu = (e) => e.preventDefault();

// Canvas resize handling
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    if (gl && resolutionID !== null) {
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.uniform2f(resolutionID, canvas.width, canvas.height);
    }
}

window.addEventListener('resize', resizeCanvas);

let cloth = new Cloth();

/////////////////////////////////////////////
// RENDERER
/////////////////////////////////////////////
async function initWebGL() {
    try {
        gl = canvas.getContext('webgl');
        
        if (!gl) {
            throw new Error("WebGL not supported");
        }

        let EXT = gl.getExtension("OES_element_index_uint") ||
            gl.getExtension("MOZ_OES_element_index_uint") ||
            gl.getExtension("WEBKIT_OES_element_index_uint");

        if (!EXT) {
            console.warn("OES_element_index_uint extension not available");
        }

        gl.clearColor(0.0, 0.0, 0.0, 0.0);
        
        // Load shaders
        const vertexShaderSource = await fetchHTTP("./shaders/vert.glsl");
        const fragmentShaderSource = await fetchHTTP("./shaders/frag.glsl");
        
        if (!vertexShaderSource || !fragmentShaderSource) {
            throw new Error("Failed to load shaders");
        }

        let vertexShader = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vertexShader, vertexShaderSource);
        gl.compileShader(vertexShader);
        
        if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
            throw new Error("Vertex shader compilation error: " + gl.getShaderInfoLog(vertexShader));
        }

        let fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fragmentShader, fragmentShaderSource);
        gl.compileShader(fragmentShader);
        
        if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
            throw new Error("Fragment shader compilation error: " + gl.getShaderInfoLog(fragmentShader));
        }

        let program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            throw new Error("Shader program linking error: " + gl.getProgramInfoLog(program));
        }
        
        gl.useProgram(program);

        // Get uniform and attribute locations
        orthoMatrixID = gl.getUniformLocation(program, "u_ortho");
        modelMatrixID = gl.getUniformLocation(program, "u_model");
        viewMatrixID = gl.getUniformLocation(program, "u_view");
        timeID = gl.getUniformLocation(program, "u_time");
        resolutionID = gl.getUniformLocation(program, "u_resolution");
        a_PostionID = gl.getAttribLocation(program, "a_position");

        // Create buffers
        indicesbuffer = gl.createBuffer();
        vertexbuffer = gl.createBuffer();

        // Set initial uniforms
        gl.uniform2f(resolutionID, canvas.width, canvas.height);
        gl.uniformMatrix4fv(orthoMatrixID, false, orthoMatrix);
        gl.uniformMatrix4fv(viewMatrixID, false, viewMatrix);
        gl.uniformMatrix4fv(modelMatrixID, false, [
            1.0, 0.0, 0.0, 0.0,
            0.0, 1.0, 0.0, 0.0,
            0.0, 0.0, 1.0, 0.0,
            0.0, 0.0, 0.0, 1.0
        ]);

        // Initialize render mode after WebGL is ready
        render_mode = gl.POINTS;

        return true;
    } catch (error) {
        console.error("WebGL initialization failed:", error);
        return false;
    }
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

// WebGL variables
let orthoMatrixID, modelMatrixID, viewMatrixID, timeID, resolutionID, a_PostionID;
let indicesbuffer, vertexbuffer;

// @mrdoob Performance Monitor
let stats = new Stats();
stats.showPanel(0);
document.body.appendChild(stats.dom);

let loadTime = Date.now();
let lastTime = loadTime;
let nbFrames = 0;

// Will be set after WebGL initialization
let render_mode;

function render() {
    let currentTime = Date.now();
    nbFrames++;
    if (currentTime - lastTime >= 1000.0) {
        console.log(1000.0 / nbFrames + " ms/frame");
        nbFrames = 0;
        lastTime += 1000.0;
    }

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Update index buffer if needed
    if (cloth.needsIndexUpdate) {
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indicesbuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(cloth.indices), gl.STATIC_DRAW);
        cloth.needsIndexUpdate = false;
    }

    // 1st attribute buffer : vertices
    gl.enableVertexAttribArray(a_PostionID);
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexbuffer);
    gl.bufferData(gl.ARRAY_BUFFER, cloth.vertices, gl.DYNAMIC_DRAW);
    gl.vertexAttribPointer(a_PostionID, 3, gl.FLOAT, false, 0, 0);

    // Time Uniform
    gl.uniform1f(timeID, (currentTime - loadTime) / 1000.0);

    gl.drawElements(render_mode, cloth.indices.length, gl.UNSIGNED_INT, 0);
    gl.flush();
}

async function startSimulation() {
    const initialized = await initWebGL();
    if (!initialized) {
        document.body.innerHTML = "<h1>WebGL not supported or failed to initialize</h1>";
        return;
    }

    // Set up keyboard controls after WebGL is initialized
    document.addEventListener("keypress", function (key) {
        if (key.key === 'w') {
            render_mode = render_mode === gl.POINTS ? gl.TRIANGLES : gl.POINTS;
        } else if (key.key === 'g') {
            config.gravity = config.gravity ? 0 : -0.02;
        } else if (key.key === 'r') {
            cloth = new Cloth();
            // Update index buffer
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indicesbuffer);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(cloth.indices), gl.STATIC_DRAW);
        }
    });

    // Initial index buffer setup
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indicesbuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(cloth.indices), gl.STATIC_DRAW);

    let lastFrameTime = performance.now();

    function update() {
        stats.begin();

        const currentTime = performance.now();
        const deltaTime = Math.min((currentTime - lastFrameTime) / 1000.0, 1/30); // Cap at 30fps for stability
        lastFrameTime = currentTime;

        cloth.update(deltaTime);
        render();

        stats.end();

        window.requestAnimFrame(update);
    }

    update();
}

// Start the simulation
startSimulation();
