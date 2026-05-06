var gl, canvas, program;
var points = [], normals = [];
var rotationAngle = 0.0;
var rotationMatrixLoc, normalMatrixLoc, usePhongLoc;

var isPhong = false; 
var isRotating = true; 
var rotationSpeed = 0.01;
var modelViewMatrix;

var materials = {
    copper: {
        ambient: vec4(0.19125, 0.0735, 0.0225, 1.0),
        diffuse: vec4(0.7038, 0.27048, 0.0828, 1.0),
        specular: vec4(0.256777, 0.137622, 0.086014, 1.0),
        shininess: 12.8
    },
    chrome: {
        ambient: vec4(0.25, 0.25, 0.25, 1.0),
        diffuse: vec4(0.4, 0.4, 0.4, 1.0),
        specular: vec4(0.774597, 0.774597, 0.774597, 1.0),
        shininess: 76.8
    },
    bronze: {
        ambient: vec4(0.25, 0.148, 0.06475, 1.0),
        diffuse: vec4(0.4, 0.2368, 0.1036, 1.0),
        specular: vec4(0.774597, 0.458561, 0.200621, 1.0),
        shininess: 76.8
    },
    brass: {
        ambient: vec4(0.329412, 0.223529, 0.027451, 1.0),
        diffuse: vec4(0.780392, 0.568627, 0.113725, 1.0),
        specular: vec4(0.992157, 0.941176, 0.807843, 1.0),
        shininess: 27.8974
    }
};

var currentMaterial = materials.copper;
var lightPosition = vec4(1.0, 1.0, 1.0, 1.0);
var lightAmbient = vec4(0.2, 0.2, 0.2, 1.0);
var lightDiffuse = vec4(1.0, 1.0, 1.0, 1.0);
var lightSpecular = vec4(1.0, 1.0, 1.0, 1.0);

window.onload = function init() {
    canvas = document.getElementById("gl-canvas");
    gl = canvas.getContext("webgl2");
    if (!gl) { alert("WebGL 2.0 isn't available"); return; }

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.98, 0.98, 0.98, 1.0);
    gl.enable(gl.DEPTH_TEST);

    // Initial load of the first model in the dropdown
    loadModelFromServer(document.getElementById("modelSelect").value);

    // Handle dropdown selection
    document.getElementById("modelSelect").onchange = function() {
        loadModelFromServer(this.value);
    };

    document.getElementById("toggleShading").onclick = function() {
        isPhong = !isPhong;
        this.innerHTML = isPhong ? "Switch to Gouraud" : "Switch to Phong";
        document.getElementById("currentMode").innerHTML = isPhong ? "Current: Phong" : "Current: Gouraud";
        if (program) gl.uniform1i(usePhongLoc, isPhong);
    };

    document.getElementById("toggleRotation").onclick = function() {
        isRotating = !isRotating;
        this.innerHTML = isRotating ? "Stop Rotation" : "Start Rotation";
    };

    document.getElementById("speedSlider").oninput = function() {
        rotationSpeed = parseFloat(this.value);
    };

    document.getElementById("materialSelect").onchange = function() {
        currentMaterial = materials[this.value];
        if (program) updateMaterialUniforms();
    };
};

function loadModelFromServer(url) {
    if (!url) return;
    document.getElementById("loadingMsg").style.display = "inline";

    fetch(url)
        .then(response => {
            if (!response.ok) throw new Error("Could not find " + url);
            return response.text();
        })
        .then(content => {
            parseOFF(content);
            setupBuffersAndDraw();
            document.getElementById("loadingMsg").style.display = "none";
        })
        .catch(err => {
            console.error(err);
            alert("Error loading model. Check console.");
            document.getElementById("loadingMsg").style.display = "none";
        });
}

function updateMaterialUniforms() {
    var ambientProduct = mult(lightAmbient, currentMaterial.ambient);
    var diffuseProduct = mult(lightDiffuse, currentMaterial.diffuse);
    var specularProduct = mult(lightSpecular, currentMaterial.specular);

    gl.uniform4fv(gl.getUniformLocation(program, "ambientProduct"), flatten(ambientProduct));
    gl.uniform4fv(gl.getUniformLocation(program, "diffuseProduct"), flatten(diffuseProduct));
    gl.uniform4fv(gl.getUniformLocation(program, "specularProduct"), flatten(specularProduct));
    gl.uniform1f(gl.getUniformLocation(program, "shininess"), currentMaterial.shininess);
}

function parseOFF(content) {
    var lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('#'));
    if (lines[0] !== "OFF") return;
    
    var stats = lines[1].split(/\s+/);
    var numVertices = parseInt(stats[0]), numFaces = parseInt(stats[1]);
    var uniqueVertices = [];
    
    for (var i = 0; i < numVertices; i++) {
        var v = lines[i + 2].split(/\s+/).map(Number);
        uniqueVertices.push(vec4(v[0], v[1], v[2], 1.0));
    }
    
    var vertexNormals = new Array(numVertices).fill(0).map(() => vec3(0, 0, 0));
    var faces = [];
    
    for (var j = 0; j < numFaces; j++) {
        var f = lines[j + 2 + numVertices].split(/\s+/).map(Number);
        faces.push(f);
        var t1 = subtract(uniqueVertices[f[2]], uniqueVertices[f[1]]);
        var t2 = subtract(uniqueVertices[f[3]], uniqueVertices[f[1]]);
        var faceNormal = normalize(cross(t1, t2));
        for (var n = 1; n <= f[0]; n++) {
            vertexNormals[f[n]] = add(vertexNormals[f[n]], faceNormal);
        }
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
    points.forEach(p => { for(var i=0; i<3; i++) { if(p[i] < min[i]) min[i] = p[i]; if(p[i] > max[i]) max[i] = p[i]; } });
    var center = vec3((min[0]+max[0])/2, (min[1]+max[1])/2, (min[2]+max[2])/2);
    var maxDim = Math.max(max[0]-min[0], max[1]-min[1], max[2]-min[2]) || 1;

    var projectionMatrix = ortho(-maxDim*0.7, maxDim*0.7, -maxDim*0.7, maxDim*0.7, -maxDim*10, maxDim*10);
    modelViewMatrix = lookAt(vec3(center[0], center[1], center[2] + maxDim), center, vec3(0,1,0));

    var vBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(points), gl.STATIC_DRAW);
    gl.vertexAttribPointer(gl.getAttribLocation(program, "vPosition"), 4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(gl.getAttribLocation(program, "vPosition"));

    var nBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, nBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(normals), gl.STATIC_DRAW);
    gl.vertexAttribPointer(gl.getAttribLocation(program, "vNormal"), 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(gl.getAttribLocation(program, "vNormal"));

    updateMaterialUniforms();
    
    gl.uniform4fv(gl.getUniformLocation(program, "lightPosition"), flatten(lightPosition));
    usePhongLoc = gl.getUniformLocation(program, "usePhong");
    gl.uniform1i(usePhongLoc, isPhong);

    gl.uniformMatrix4fv(gl.getUniformLocation(program, "projectionMatrix"), false, flatten(projectionMatrix));
    gl.uniformMatrix4fv(gl.getUniformLocation(program, "modelViewMatrix"), false, flatten(modelViewMatrix));
    
    rotationMatrixLoc = gl.getUniformLocation(program, "rotationMatrix");
    normalMatrixLoc = gl.getUniformLocation(program, "normalMatrix");

    if (!window.requestAnimationFrameId) {
        render();
    }
}

function render() {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    
    if (isRotating) rotationAngle += rotationSpeed;
    
    var rMatrix = rotateY(rotationAngle * 180 / Math.PI);
    gl.uniformMatrix4fv(rotationMatrixLoc, false, flatten(rMatrix));

    var mvp = mult(modelViewMatrix, rMatrix);
    var nMatrix = normalMatrix(mvp, true);
    gl.uniformMatrix3fv(normalMatrixLoc, false, flatten(nMatrix));

    if (points.length > 0) {
        gl.drawArrays(gl.TRIANGLES, 0, points.length);
    }
    
    window.requestAnimationFrameId = requestAnimationFrame(render);
}
