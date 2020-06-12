helm install mongodb --set mongodbUsername=testGaloy,mongodbPassword=testGaloy,mongodbDatabase=galoy,persistence.enabled=false bitnami/mongodb

helm install bitcoind -f ../../bitcoind-chart/regtest-values.yaml ../../bitcoind-chart/

helm install lnd -f ../../lnd-chart/regtest-values.yaml ../../lnd-chart/

kubectl wait --for=condition=ready pod -l app=mongodb
kubectl wait --for=condition=ready pod -l app=bitcoind-container
kubectl wait --for=condition=ready pod -l app=lnd-container

export NETWORK="regtest"
export TLS=$(kubectl exec lnd-container-0 -- base64 /root/.lnd/tls.cert | tr -d '\n\r')
export MACAROON=$(kubectl exec lnd-container-0 -- base64 /root/.lnd/data/chain/bitcoin/$NETWORK/admin.macaroon | tr -d '\n\r')
export MACAROONOUTSIDE1=$(kubectl exec lnd-container-1 -- base64 /root/.lnd/data/chain/bitcoin/$NETWORK/admin.macaroon | tr -d '\n\r')
export MACAROONOUTSIDE2=$(kubectl exec lnd-container-2 -- base64 /root/.lnd/data/chain/bitcoin/$NETWORK/admin.macaroon | tr -d '\n\r')

# change 18443 to 18332 for testnet below
export BITCOINDPORT=$(kubectl get services | awk '/bitcoind-service/ {print $5}' | grep -Po '18443:\K[0-9]+')

export MINIKUBEIP='172.17.0.2'
export BITCOINDADDR=$MINIKUBEIP

export LNDIP=$MINIKUBEIP
export LNDRPCPORT=$(kubectl get services | awk '/lnd-service/ {print $5}' | grep -Po '10009:\K[0-9]+')

export LNDOUTSIDE1ADDR=$MINIKUBEIP
export LNDOUTSIDE1RPCPORT=$(kubectl get services | awk '/lnd-outside-1/ {print $5}' | grep -Po '10009:\K[0-9]+')

export LNDOUTSIDE2ADDR=$MINIKUBEIP
export LNDOUTSIDE2RPCPORT=$(kubectl get services | awk '/lnd-outside-2/ {print $5}' | grep -Po '10009:\K[0-9]+')
export NETWORK=regtest

export MONGODB_ADDRESS="$MINIKUBEIP:"$(kubectl get services | awk '/mongodb/ {print $5}' | grep -Po '27017:\K[0-9]+')