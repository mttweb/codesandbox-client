import React from 'react';
import styled from 'styled-components';

const Container = styled.div`
  .cf-text {
    color: ${props =>
      props.theme.light
        ? `rgba(0, 0, 0, 0.8)`
        : `rgba(255, 255, 255, 0.8)`} !important;
  }
`;

const CODEFUND_LINK = 'https://codefund.app/properties/24/funder.js';
let loaded = false;

export default class CodeFund extends React.PureComponent {
  componentDidMount() {
    if (!loaded) {
      loaded = true;

      const script = document.createElement('script');
      script.setAttribute('src', CODEFUND_LINK);
      script.async = 'true';
      script.setAttribute('id', 'external-js');
      document.head.appendChild(script);
    }
  }

  render() {
    return (
      <Container>
        <div id="codefund" />
      </Container>
    );
  }
}
