var gl, canvas, program;
var points = [], normals = [];

var rotationAngle = 0.0;
var rotationMatrixLoc, normalMatrixLoc;

var isPhong = false; // shading state control
var isRotating = true; // rotation state control
var rotationSpeed = 0.01;
var usePhongLoc;

var modelViewMatrix;

// Material property definitions
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

// Light source definitions
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

    // Handle .off file selection
    document.getElementById("fileInput").onchange = function() {
        if (this.files.length === 0) return;
        var reader = new FileReader();
        reader.onload = function() {
            parseOFF(reader.result);
            setupBuffersAndDraw();
        };
        reader.readAsText(this.files[0]);
    };

    // Toggle between Phong and Gouraud shading
    document.getElementById("toggleShading").onclick = function() {
        isPhong = !isPhong;
        if (isPhong) {
            this.innerHTML = "Switch to Gouraud";
            document.getElementById("currentMode").innerHTML = "Current: Phong";
        } else {
            this.innerHTML = "Switch to Phong";
            document.getElementById("currentMode").innerHTML = "Current: Gouraud";
        }
        if (program) gl.uniform1i(usePhongLoc, isPhong);
    };

    // Toggle model rotation animation
    document.getElementById("toggleRotation").onclick = function() {
        isRotating = !isRotating;
        if (isRotating) {
            this.innerHTML = "Stop Rotation";
        } else {
            this.innerHTML = "Start Rotation";
        }
    };

    // Update rotation speed from slider input
    document.getElementById("speedSlider").oninput = function() {
        rotationSpeed = parseFloat(this.value);
    };

    // Switch material properties at runtime
    document.getElementById("materialSelect").onchange = function() {
        currentMaterial = materials[this.value];
        if (program) updateMaterialUniforms();
    };
};

// Calculate and send material-light products to GPU
function updateMaterialUniforms() {
    var ambientProduct = mult(lightAmbient, currentMaterial.ambient);
    var diffuseProduct = mult(lightDiffuse, currentMaterial.diffuse);
    var specularProduct = mult(lightSpecular, currentMaterial.specular);

    gl.uniform4fv(gl.getUniformLocation(program, "ambientProduct"), flatten(ambientProduct));
    gl.uniform4fv(gl.getUniformLocation(program, "diffuseProduct"), flatten(diffuseProduct));
    gl.uniform4fv(gl.getUniformLocation(program, "specularProduct"), flatten(specularProduct));
    gl.uniform1f(gl.getUniformLocation(program, "shininess"), currentMaterial.shininess);
}

// Extract geometry and calculate vertex normals from OFF file data
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

// Initialize shaders, buffers, and static uniforms
function setupBuffersAndDraw() {
    program = initShaders(gl, "vertex-shader", "fragment-shader");
    gl.useProgram(program);

    // Normalize model scale and position
    var min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    points.forEach(p => { for(var i=0; i<3; i++) { if(p[i] < min[i]) min[i] = p[i]; if(p[i] > max[i]) max[i] = p[i]; } });
    var center = vec3((min[0]+max[0])/2, (min[1]+max[1])/2, (min[2]+max[2])/2);
    var maxDim = Math.max(max[0]-min[0], max[1]-min[1], max[2]-min[2]) || 1;

    var projectionMatrix = ortho(-maxDim*0.7, maxDim*0.7, -maxDim*0.7, maxDim*0.7, -maxDim*10, maxDim*10);
    modelViewMatrix = lookAt(vec3(center[0], center[1], center[2] + maxDim), center, vec3(0,1,0));

    // Send vertex positions to attribute once on load
    var vBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(points), gl.STATIC_DRAW);
    gl.vertexAttribPointer(gl.getAttribLocation(program, "vPosition"), 4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(gl.getAttribLocation(program, "vPosition"));

    // Send vertex normals to attribute once on load
    var nBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, nBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(normals), gl.STATIC_DRAW);
    gl.vertexAttribPointer(gl.getAttribLocation(program, "vNormal"), 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(gl.getAttribLocation(program, "vNormal"));

    updateMaterialUniforms();
    
    // Set static uniforms
    gl.uniform4fv(gl.getUniformLocation(program, "lightPosition"), flatten(lightPosition));
    usePhongLoc = gl.getUniformLocation(program, "usePhong");
    gl.uniform1i(usePhongLoc, isPhong);

    gl.uniformMatrix4fv(gl.getUniformLocation(program, "projectionMatrix"), false, flatten(projectionMatrix));
    gl.uniformMatrix4fv(gl.getUniformLocation(program, "modelViewMatrix"), false, flatten(modelViewMatrix));
    
    rotationMatrixLoc = gl.getUniformLocation(program, "rotationMatrix");
    normalMatrixLoc = gl.getUniformLocation(program, "normalMatrix");

    render();
}

// Animation loop to update dynamic uniforms and redraw
function render() {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    
    if (isRotating) {
        rotationAngle += rotationSpeed;
    }
    
    // Update rotation matrix uniform every frame
    var rMatrix = rotateY(rotationAngle * 180 / Math.PI);
    gl.uniformMatrix4fv(rotationMatrixLoc, false, flatten(rMatrix));

    // Calculate and send normal matrix (inverse-transpose) every frame
    var mvp = mult(modelViewMatrix, rMatrix);
    var nMatrix = normalMatrix(mvp, true);
    gl.uniformMatrix3fv(normalMatrixLoc, false, flatten(nMatrix));

    gl.drawArrays(gl.TRIANGLES, 0, points.length);
    requestAnimationFrame(render);
}
