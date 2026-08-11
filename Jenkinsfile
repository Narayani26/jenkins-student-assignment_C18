pipeline {
agent any
stages {
stage('Build') {
steps {
echo 'Compiling application...'
}
}
stage('Test') {
steps {
echo 'Running unit tests...'
}
}
stage('Package') {
steps {
// Write code here to generate build-info.txt
sh 'echo "Build executed on $(date)" > build-info.txt'
}
}
}
post {
success {
echo 'Build successful! Ready for release.'
}
}
}