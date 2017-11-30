# Prepack test input
cat ./test/std-in/StdIn.js | node ./bin/prepack.js --out StdIn-test.js
# Run the resulting program and check it for expected output
node ./StdIn-test.js | grep "Hello world from std-in!" > /dev/null
if [[ $? -ne 0 ]]; then
    exit 1
fi
rm ./StdIn-test.js

# Prepack test empty input and check if it logs correct msg
echo "" | node ./bin/prepack.js --out StdIn-test.js | grep "No source code to prepack" > /dev/null
if [[ $? -ne 1 ]]; then
    exit 1
fi

# Prepack test input and check if it exits with signal 1
cat ./test/std-in/StdInError.js | node ./bin/prepack.js --out StdInError-test.js 2> /dev/null
if [[ $? -ne 1 ]]; then
    # If the test failed, rerun and show the output
    cat ./test/std-in/StdInError.js | node ./bin/prepack.js --out StdInError-test.js
    exit 1
fi
