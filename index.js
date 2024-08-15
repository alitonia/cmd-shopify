const domainName = "xabc.myshopify.com"
const secretToken = "shpat_abcdefghijklmnopqrstuvwxyz1234567890"
const saveFileName = 'temp.json'

const textToRemoveInDescription = `<span itemtype="http://schema.org/Review" itemscope="" itemprop="Review"><span itemtype="http://schema.org/Rating" itemscope="" itemprop="reviewRating"></span><span itemtype="https://schema.org/Person" itemscope="" itemprop="author"></span></span> <span itemtype="http://schema.org/AggregateRating" itemscope="" itemprop="aggregateRating"></span>`;

const fs = require('node:fs');
const prompts = require('prompts');
const chalk = require('chalk');


const ACTIONS = {
    REMOVE_ALL_NOINDEX_IN_PRODUCT: 1,
    REMOVE_EMPTY_SCHEMA_IN_PRODUCT_DESCRIPTION: 2,
}
const initialQuestions = [
    {
        type: 'select',
        name: 'action',
        message: 'What do you want to do?',
        choices: [
            { title: 'Remove noindex in products', value: ACTIONS.REMOVE_ALL_NOINDEX_IN_PRODUCT },
            { title: 'Remove empty description in product', value: ACTIONS.REMOVE_EMPTY_SCHEMA_IN_PRODUCT_DESCRIPTION },
        ],
    }
];

(async () => {

    const response = await prompts(initialQuestions);
    const { action } = response

    switch (action) {
        case ACTIONS.REMOVE_ALL_NOINDEX_IN_PRODUCT:
            await removeAllNoindexProducts(domainName, secretToken);
            break;
        case ACTIONS.REMOVE_EMPTY_SCHEMA_IN_PRODUCT_DESCRIPTION:
            await removeEmptySchemaInProductDescription(domainName, secretToken);
            break;
    }
    console.log('Done');
})();


async function sleep(s) {
    return new Promise(resolve => setTimeout(resolve, s)); // Wait for s
}
async function sleepWithQueryData(data) {
    const requestedQueryCost = data.extensions.cost.requestedQueryCost;
    const currentAvailableQueryCost = data.extensions.cost.throttleStatus.currentlyAvailable;
    if (requestedQueryCost > currentAvailableQueryCost) {
        await sleep(requestedQueryCost - currentAvailableQueryCost); // Wait for 2
    }
}

async function removeAllNoindexProducts(domainName, secretToken) {
    var graphqlEndpoint = `https://${domainName}/admin/api/2024-07/graphql.json`

    var lastCursor = null;
    var hasNextPage = true;

    var productCount = 0;
    var productMetafieldCount = 0;
    var l = []

    for (let i = 0; i < 100; i++) {

        console.log("Start cursor", lastCursor)

        var queryString = `query {
            products(first: 100, after: ${lastCursor ? `"${lastCursor}"` : "null"}) {
              edges {
                cursor
                node {
                  id
                  handle
                  metafield(namespace: "seo", key: "hidden") {
                      id
                      value
                      updatedAt
                  }
                }
              }
              pageInfo {
                  hasNextPage
                  endCursor
              }
            
            }
          }`
        var response = await fetch(
            graphqlEndpoint,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Shopify-Access-Token': secretToken
                },
                body: JSON.stringify({ query: queryString })
            }
        )
        console.log("New response status", response.status);
        var data = await response.json();

        const products = data.data.products.edges;
        const productWithMetafield = products.filter(product => product.node.metafield?.value === "1")

        if (products.length > 0) {
            console.log(products.length, products[0]);
        }

        productCount += products.length;
        productMetafieldCount += productWithMetafield.length;

        l = l.concat(productWithMetafield)

        for (let product of productWithMetafield) {
            const metafieldId = product.node.metafield.id;
            const shortId = metafieldId.split('/').pop();

            const res = await fetch(
                `https://${domainName}/admin/api/2024-04/metafields/${shortId}.json`,
                {
                    method: "DELETE",
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Shopify-Access-Token': secretToken
                    }
                }
            )
            console.log("Update", product.node.handle, "->", res.status)
            await sleep(1000); // Wait for 1 second between requests

        }

        hasNextPage = data.data.products.pageInfo.hasNextPage;
        lastCursor = data.data.products.pageInfo.endCursor;

        if (!hasNextPage) {
            break;
        } else {
            await sleepWithQueryData(data);
        }
    }

    console.log("Finished updating SEO meta fields", hasNextPage, productCount, productMetafieldCount);
    fs.writeFileSync('products.json', JSON.stringify(l, null, 2));
}

async function removeEmptySchemaInProductDescription(domainName, secretToken) {
    var graphqlEndpoint = `https://${domainName}/admin/api/2024-07/graphql.json`

    var lastCursor = null;
    var hasNextPage = true;

    var productCount = 0;
    var productToUpdateCount = 0;
    var l = []

    for (let i = 0; i < 100; i++) {

        console.log("Start cursor", lastCursor)

        var queryString = `query {
            products(first: 2, after: ${lastCursor ? `"${lastCursor}"` : "null"}) {
              edges {
                cursor
                node {
                  id
                  handle
                  descriptionHtml
                }
              }
              pageInfo {
                  hasNextPage
                  endCursor
              }
            
            }
          }`
        var response = await fetch(
            graphqlEndpoint,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Shopify-Access-Token': secretToken
                },
                body: JSON.stringify({ query: queryString })
            }
        )
        console.log("New response status", response.status);
        var data = await response.json();

        const products = data.data.products.edges;
        const productsToChangeDescription = products.filter(product => product.node.descriptionHtml.includes(textToRemoveInDescription))

        if (products.length > 0) {
            console.log(products.length, products[0]);
        }

        productCount += products.length;
        productToUpdateCount += productsToChangeDescription.length;

        l = l.concat(productsToChangeDescription)

        for (let product of productsToChangeDescription) {
            const productId = product.node.id;
            const newDescription = product.node.descriptionHtml.replace(textToRemoveInDescription, '');
            console.log(chalk.blue("New description:"), productId, newDescription);
            return
            const updateQuery = `mutation {
  productUpdate(input: {id: "${productId}", descriptionHtml: "${newDescription}" }) {
    product {
      id
    }
  }
}
            `
            var res = await fetch(
                graphqlEndpoint,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Shopify-Access-Token': secretToken
                    },
                    body: JSON.stringify({ query: updateQuery })
                }
            )

            console.log("Update", product.node.handle, "->", res.status)
            await sleep(1000); // Wait for 1 second between requests
        }

        hasNextPage = data.data.products.pageInfo.hasNextPage;
        lastCursor = data.data.products.pageInfo.endCursor;

        if (!hasNextPage) {
            break;
        } else {
            await sleepWithQueryData(data);
        }
    }

    console.log("Finished updating SEO meta fields", hasNextPage, productCount, productToUpdateCount);
    fs.writeFileSync(saveFileName, JSON.stringify(l, null, 2));
}