var gl, canvas, program;
var points = [], normals = [];
var rotationAngle = 0.0;
var rotationMatrixLoc, normalMatrixLoc, usePhongLoc;

var isPhong = false, isRotating = true, rotationSpeed = 0.01;
var modelViewMatrix;

var materials = {
    copper: { ambient: vec4(0.19, 0.07, 0.02, 1.0), diffuse: vec4(0.70, 0.27, 0.08, 1.0), specular: vec4(0.25, 0.13, 0.08, 1.0), shininess: 12.8 },
    chrome: { ambient: vec4(0.25, 0.25, 0.25, 1.0), diffuse: vec4(0.4, 0.4, 0.4, 1.0), specular: vec4(0.77, 0.77, 0.77, 1.0), shininess: 76.8 },
    bronze: { ambient: vec4(0.25, 0.14, 0.06, 1.0), diffuse: vec4(0.4, 0.23, 0.10, 1.0), specular: vec4(0.77, 0.45, 0.20, 1.0), shininess: 76.8 },
    brass: { ambient: vec4(0.32, 0.22, 0.02, 1.0), diffuse: vec4(0.78, 0.56, 0.11, 1.0), specular: vec4(0.99, 0.94, 0.80, 1.0), shininess: 27.8 }
};

var currentMaterial = materials.copper;
var lightPosition = vec4(1.0, 1.0, 1.0, 1.0), lightAmbient = vec4(0.2, 0.2, 0.2, 1.0), lightDiffuse = vec4(1.0, 1.0, 1.0, 1.0), lightSpecular = vec4(1.0, 1.0, 1.0, 1.0);

window.onload = function init() {
    canvas = document.getElementById("gl-canvas");
    gl = canvas.getContext("webgl2");
    if (!gl) { alert("WebGL 2.0 isn't available"); return; }

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.98, 0.98, 0.98, 1.0);
    gl.enable(gl.DEPTH_TEST);

    // Default load from 'Models/' folder
    loadModelFromServer(document.getElementById("modelSelect").value);

    document.getElementById("modelSelect").onchange = function() { loadModelFromServer(this.value); };
    document.getElementById("toggleShading").onclick = function() {
        isPhong = !isPhong;
        this.innerHTML = isPhong ? "Switch to Gouraud" : "Switch to Phong";
        document.getElementById("currentMode").innerHTML = isPhong ? "Current: Phong" : "Current: Gouraud";
        if (program) gl.uniform1i(usePhongLoc, isPhong);
    };
    document.getElementById("toggleRotation").onclick = function() { this.innerHTML = (isRotating = !isRotating) ? "Stop Rotation" : "Start Rotation"; };
    document.getElementById("speedSlider").oninput = function() { rotationSpeed = parseFloat(this.value); };
    document.getElementById("materialSelect").onchange = function() { currentMaterial = materials[this.value]; if (program) updateMaterialUniforms(); };
};

function loadModelFromServer(url) {
    document.getElementById("loadingMsg").style.display = "inline";
    fetch(url).then(r => r.text()).then(content => {
        parseOFF(content);
        setupBuffersAndDraw();
        document.getElementById("loadingMsg").style.display = "none";
    }).catch(e => { alert("Error loading " + url); document.getElementById("loadingMsg").style.display = "none"; });
}

function updateMaterialUniforms() {
    gl.uniform4fv(gl.getUniformLocation(program, "ambientProduct"), flatten(mult(lightAmbient, currentMaterial.ambient)));
    gl.uniform4fv(gl.getUniformLocation(program, "diffuseProduct"), flatten(mult(lightDiffuse, currentMaterial.diffuse)));
    gl.uniform4fv(gl.getUniformLocation(program, "specularProduct"), flatten(mult(lightSpecular, currentMaterial.specular)));
    gl.uniform1f(gl.getUniformLocation(program, "shininess"), currentMaterial.shininess);
}

function parseOFF(content) {
    var lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('#'));
    if (lines[0] !== "OFF") return;
    var stats = lines[1].split(/\s+/), numVertices = parseInt(stats[0]), numFaces = parseInt(stats[1]);
    var uniqueVertices = [];
    for (var i = 0; i < numVertices; i++) {
        var v = lines[i + 2].split(/\s+/).map(Number);
        uniqueVertices.push(vec4(v[0], v[1], v[2], 1.0));
    }
    var vertexNormals = new Array(numVertices).fill(0).map(() => vec3(0, 0, 0)), faces = [];
    for (var j = 0; j < numFaces; j++) {
        var f = lines[j + 2 + numVertices].split(/\s+/).map(Number);
        faces.push(f);
        var t1 = subtract(uniqueVertices[f[2]], uniqueVertices[f[1]]), t2 = subtract(uniqueVertices[f[3]], uniqueVertices[f[1]]);
        var faceNormal = normalize(cross(t1, t2));
        for (var n = 1; n <= f[0]; n++) vertexNormals[f[n]] = add(vertexNormals[f[n]], faceNormal);
    }
    for (var v = 0; v < numVertices; v++) vertexNormals[v] = normalize(vertexNormals[v]);
    points = []; normals = [];
    for (var j = 0; j < faces.length; j++) {
        var f = faces[j];
        for (var k = 1; k < f[0] - 1; k++) {
            points.push(uniqueVertices[f[1]], uniqueVertices[f[k+1]], uniqueVertices[f[k+2]]);
            normals.push(vertexNormals[f[1]], vertexNormals[f[k+1]], vertexNormals[f[k+2]]);
        }
    }
}

function setupBuffersAndDraw() {
    program = initShaders(gl, "vertex-shader", "fragment-shader");
    gl.useProgram(program);
    var min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    points.forEach(p => { for(var i=0; i<3; i++) { min[i]=Math.min(min[i],p[i]); max[i]=Math.max(max[i],p[i]); } });
    var center = vec3((min[0]+max[0])/2, (min[1]+max[1])/2, (min[2]+max[2])/2), maxDim = Math.max(max[0]-min[0], max[1]-min[1], max[2]-min[2]) || 1;
    var projectionMatrix = ortho(-maxDim*0.7, maxDim*0.7, -maxDim*0.7, maxDim*0.7, -maxDim*10, maxDim*10);
    modelViewMatrix = lookAt(vec3(center[0], center[1], center[2] + maxDim), center, vec3(0,1,0));

    function setBuffer(data, loc, size) {
        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
        gl.bufferData(gl.ARRAY_BUFFER, flatten(data), gl.STATIC_DRAW);
        gl.vertexAttribPointer(gl.getAttribLocation(program, loc), size, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(gl.getAttribLocation(program, loc));
    }
    setBuffer(points, "vPosition", 4); setBuffer(normals, "vNormal", 3);
    updateMaterialUniforms();
    gl.uniform4fv(gl.getUniformLocation(program, "lightPosition"), flatten(lightPosition));
    gl.uniform1i(usePhongLoc = gl.getUniformLocation(program, "usePhong"), isPhong);
    gl.uniformMatrix4fv(gl.getUniformLocation(program, "projectionMatrix"), false, flatten(projectionMatrix));
    gl.uniformMatrix4fv(gl.getUniformLocation(program, "modelViewMatrix"), false, flatten(modelViewMatrix));
    rotationMatrixLoc = gl.getUniformLocation(program, "rotationMatrix");
    normalMatrixLoc = gl.getUniformLocation(program, "normalMatrix");
    if (!window.animId) render();
}

function render() {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (isRotating) rotationAngle += rotationSpeed;
    var rMatrix = rotateY(rotationAngle * 180 / Math.PI);
    gl.uniformMatrix4fv(rotationMatrixLoc, false, flatten(rMatrix));
    gl.uniformMatrix3fv(normalMatrixLoc, false, flatten(normalMatrix(mult(modelViewMatrix, rMatrix), true)));
    if (points.length) gl.drawArrays(gl.TRIANGLES, 0, points.length);
    window.animId = requestAnimationFrame(render);
}
