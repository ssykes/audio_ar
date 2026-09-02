/**
 * Documentation Accuracy Checker
 * Compares documentation against actual codebase to verify accuracy
 */

const fs = require('fs');
const path = require('path');

class DocumentationChecker {
    constructor(projectRoot) {
        this.projectRoot = projectRoot;
        this.findings = {
            missingReferences: [],
            outdatedReferences: [],
            accurateReferences: []
        };
    }

    /**
     * Check if classes mentioned in documentation exist in codebase
     */
    checkClassReferences(docsPath) {
        const docFiles = this.getAllMarkdownFiles(docsPath);
        const jsFiles = this.getAllJsFiles(this.projectRoot);
        
        // Get all class definitions in JS files
        const jsClasses = new Set();
        jsFiles.forEach(file => {
            const content = fs.readFileSync(file, 'utf8');
            // Find class declarations
            const classMatches = content.match(/class\s+(\w+)/g);
            if (classMatches) {
                classMatches.forEach(match => {
                    const className = match.split(' ')[1];
                    jsClasses.add(className);
                });
            }
        });

        // Check documentation for class references
        docFiles.forEach(docFile => {
            const content = fs.readFileSync(docFile, 'utf8');
            
            // Find class references in documentation
            const docClasses = content.match(/`(SpatialAudioEngine|MapAppShared|MapEditorApp|MapPlayerApp|ApiClient|GPSUtils|SampleSource|AreaSoundSource|CachedSampleSource|GpsSoundSource|OscillatorSource|MultiOscillatorSource)`/g);
            
            if (docClasses) {
                docClasses.forEach(cls => {
                    const className = cls.replace(/`/g, '');
                    if (jsClasses.has(className)) {
                        this.findings.accurateReferences.push({
                            class: className,
                            file: docFile,
                            status: 'accurate'
                        });
                    } else {
                        this.findings.missingReferences.push({
                            class: className,
                            file: docFile,
                            status: 'missing'
                        });
                    }
                });
            }
        });

        return this.findings;
    }

    /**
     * Check if API endpoints mentioned in documentation exist in codebase
     */
    checkApiEndpoints(docsPath) {
        const docFiles = this.getAllMarkdownFiles(docsPath);
        const jsFiles = this.getAllJsFiles(this.projectRoot);
        
        // Get all API endpoint references in JS files
        const jsEndpoints = new Set();
        jsFiles.forEach(file => {
            const content = fs.readFileSync(file, 'utf8');
            // Find API endpoint references
            const endpointMatches = content.match(/\/(auth|soundscapes|audio)\/[\w\/:]*/g);
            if (endpointMatches) {
                endpointMatches.forEach(endpoint => {
                    jsEndpoints.add(endpoint);
                });
            }
        });

        // Check documentation for endpoint references
        docFiles.forEach(docFile => {
            const content = fs.readFileSync(docFile, 'utf8');
            
            // Find endpoint references in documentation
            const docEndpoints = content.match(/`(\/auth\/\w+|\/soundscapes\/\w+|\/audio\/\w+)`/g);
            
            if (docEndpoints) {
                docEndpoints.forEach(endpoint => {
                    const endpointPath = endpoint.replace(/`/g, '');
                    if (jsEndpoints.has(endpointPath)) {
                        this.findings.accurateReferences.push({
                            endpoint: endpointPath,
                            file: docFile,
                            status: 'accurate'
                        });
                    } else {
                        this.findings.missingReferences.push({
                            endpoint: endpointPath,
                            file: docFile,
                            status: 'missing'
                        });
                    }
                });
            }
        });

        return this.findings;
    }

    getAllMarkdownFiles(dir) {
        const files = [];
        const items = fs.readdirSync(dir);
        
        items.forEach(item => {
            const fullPath = path.join(dir, item);
            const stat = fs.statSync(fullPath);
            
            if (stat.isDirectory()) {
                files.push(...this.getAllMarkdownFiles(fullPath));
            } else if (item.endsWith('.md')) {
                files.push(fullPath);
            }
        });
        
        return files;
    }

    getAllJsFiles(dir) {
        const files = [];
        const items = fs.readdirSync(dir);
        
        items.forEach(item => {
            const fullPath = path.join(dir, item);
            const stat = fs.statSync(fullPath);
            
            if (stat.isDirectory()) {
                files.push(...this.getAllJsFiles(fullPath));
            } else if (item.endsWith('.js')) {
                files.push(fullPath);
            }
        });
        
        return files;
    }

    generateReport() {
        const report = {
            summary: {
                totalMissing: this.findings.missingReferences.length,
                totalOutdated: this.findings.outdatedReferences.length,
                totalAccurate: this.findings.accurateReferences.length
            },
            details: this.findings
        };
        
        return report;
    }
}

// Usage example:
// const checker = new DocumentationChecker('./');
// checker.checkClassReferences('./docs');
// checker.checkApiEndpoints('./docs');
// const report = checker.generateReport();
// console.log(JSON.stringify(report, null, 2));

module.exports = DocumentationChecker;

console.log('Documentation Accuracy Checker - Ready to verify documentation accuracy');
console.log('To use:');
console.log('1. const checker = new DocumentationChecker(\'./\');');
console.log('2. checker.checkClassReferences(\'./docs\');');
console.log('3. checker.checkApiEndpoints(\'./docs\');');
console.log('4. const report = checker.generateReport();');