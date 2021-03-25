/**
 * @file BlockTimeCard
 * @copyright Copyright (c) 2018-2021 Dylan Miller and dfinityexplorer contributors
 * @license MIT License
 */

import React, { Component } from 'react';
import PropTypes from 'prop-types';
import axios from 'axios';
import DashCard from '../DashCard/DashCard';
import Constants from '../../constants';

/**
 * This component displays a dashboard card with seconds per block retrieved from
 * dashboard.dfinity.network.
 */
class BlockTimeCard extends Component {
  static propTypes = {
    /**
     * The index of the card. Used for theming.
     */
    cardIndex: PropTypes.number.isRequired,
    /**
     * The className passed in by styled-components when styled(MyComponent) notation is used on
     * this component.
     */
    className: PropTypes.string
  };

  /**
   * Create a BlockTimeCard object.
   * @constructor
   */
  constructor(props) {
    super(props);

    this.blocks = [];
    this.lastBlockHeight = 0;

    this.state = {
      blocksPerSecond: -1,
      error: 0
    };
  }

  /**
   * Invoked by React immediately after a component is mounted (inserted into the tree). 
   * @public
   */
  componentDidMount() {    
    // Update the block time using intervals.
    this.pollForBlockTime();
    this.interval = setInterval(
      () => { this.pollForBlockTime() },
      Constants.BLOCK_TIME_POLL_INTERVAL_MS);
  }

  /**
   * Invoked by React immediately before a component is unmounted and destroyed.
   * @public
   */
  componentWillUnmount() {
    clearInterval(this.interval);
    this.interval = null;
  }

  /**
   * Return a reference to a React element to render into the DOM.
   * @return {Object} A reference to a React element to render into the DOM.
   * @public
   */
  render() {
    let { cardIndex, className } = this.props;
    let { blocksPerSecond, error } = this.state;
    
    let blockTimeText;
    if (error >= Constants.NETWORK_ERROR_THRESHOLD)
      blockTimeText = 'Network error';
    else if (blocksPerSecond === -1)
      blockTimeText = 'Calculating...';//"No Historical Blocks" fix!!!'Loading...';
    else
      blockTimeText = blocksPerSecond.toFixed(1) + ' bps';

    return (
      <DashCard
        className={className}
        cardIndex={cardIndex}
        title='Avg Blocks'
        value={blockTimeText}
        svgIconPath={Constants.ICON_SVG_PATH_BLOCK_TIME}
      />
    );
  }

  /**
   * Update the block time.
   * 
   * This version was added for the "No Historical Blocks" fix!!! This function is basically a copy
   * of pollForBlockHeight() in BlocksCard. This method of calculating the block time is intended to
   * be temporary until we receive more reliable API data.
   * @private
   */
  pollForBlockTime() {
    // Get 10 minutes of minute data. If there is an API to get just the current block height, we
    // should use it here.
    const startDate = new Date();
    startDate.setMinutes(startDate.getMinutes() - 10);
    const endDate = new Date();
    const secondsInMinute = 60;
    const url =
      // NOTE: IC_RELEASE vs. non IC_RELEASE is '%22${Constants.IC_RELEASE}' vs. '~%22.%2B'.
      //IC_RELEASE: `https://dashboard.dfinity.network/api/datasources/proxy/2/api/v1/query_range?query=sum%20(avg%20by%20(ic_subnet)%20(artifact_pool_consensus_height_stat%7Bic%3D%22${Constants.IC_RELEASE}%22%2Cic_subnet%3D~%22.%2B%22%7D))&start=${Math.floor(startDate.getTime() / 1000)}&end=${Math.floor(endDate.getTime() / 1000)}&step=${secondsInMinute}`;
      `https://dashboard.dfinity.network/api/datasources/proxy/2/api/v1/query_range?query=sum%20(avg%20by%20(ic_subnet)%20(artifact_pool_consensus_height_stat%7Bic%3D~%22.%2B%22%2Cic_subnet%3D~%22.%2B%22%7D))&start=${Math.floor(startDate.getTime() / 1000)}&end=${Math.floor(endDate.getTime() / 1000)}&step=${secondsInMinute}`;
    axios.get(url)
      .then(res => {
        if (res.data.data.result.length && res.data.data.result[0].values.length >= 2) {
          const values = res.data.data.result[0].values;
          // Temporary workaround fix: Use second to last value, since dashboard.dfinity.network
          // seems to have a bug where the last value isn't always reliable!!!
          const lastValue = values[values.length-2];
          const newBlockHeight = Math.floor(lastValue[1]);

          // Reset calculation if we get a major glitch in the API data.
          const maxExpectedBlocksPerSecond = 50; // somewhat arbitrary, but based on observations
          const maxExpectedBlocksPerInterval =
            Constants.BLOCK_TIME_POLL_INTERVAL_MS / 1000 * maxExpectedBlocksPerSecond;
          const resetCalculation =
            newBlockHeight < this.lastBlockHeight ||
            newBlockHeight > this.lastBlockHeight + maxExpectedBlocksPerInterval;
          if (resetCalculation) {
            this.blocks = [];
            //console.log('Glitch!'); //!!!
            //console.log('newBlockHeight: ', newBlockHeight); //!!!
            //console.log('this.lastBlockHeight: ', this.lastBlockHeight); //!!!
            //console.log(values);//!!!
          }
          this.lastBlockHeight = newBlockHeight;
  
          // Add a block object for this block to the blocks[] array.
          const block = {
            height: newBlockHeight,
            timestamp: new Date(),
          };
          this.blocks.push(block);

          // Remove blocks that have expired, so that we calculate blocks per second based on only
          // the last X minutes. The goal here is to minimize the time a minor API data glitch will
          // affect the blocks per second value.
          const expireMs = 60 * 1000; // one minute
          const expiredDate = new Date(block.timestamp.getTime() - expireMs);
          while (this.blocks[0].timestamp < expiredDate)
            this.blocks.shift();

          let blocksPerSecond;
          if (this.blocks.length >= 2) {
            const numBlocks = this.blocks[this.blocks.length-1].height - this.blocks[0].height;
            const seconds =
              (this.blocks[this.blocks.length-1].timestamp - this.blocks[0].timestamp) / 1000;
            blocksPerSecond = numBlocks / seconds;              
          }
          else
            blocksPerSecond = -1;
          
          if (resetCalculation) {
            // Do not set blocksPerSecond when resetting calculation, avoiding "Calculating...".
            this.setState({
              error: 0
            });
          }
          else {
            this.setState({
              blocksPerSecond: blocksPerSecond,
              error: 0
            });
          }
        }
      })
      .catch(() => {
        this.setState(prevState => ({
          error: prevState.error + 1
        }));
      });
  }

  /** KEEP: This version was removed for the "No Historical Blocks" fix. It was difficult to get
   * consistent results by looking at historical block heights. We can hopefully go back to this
   * version later.
   * 
   * Update the block time.
   * @private
   *
  pollForBlockTime() {*/
    /* KEEP for now
    // Get one day of hourly data. Ideally, we would get 10 minutes of minute data, but
    // dashboard.dfinity.network results are inconsistent with those settings.
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 1);
    const endDate = new Date();
    const secondsInHour = 60 * 60;*//*
    // Get 10 minutes of minute data. This is still sometimes glitchy, but we'll try it out
    // temporarily.
    const startDate = new Date();
    startDate.setMinutes(startDate.getMinutes() - 10);
    const endDate = new Date();
    const secondsInMinute = 60;
    const url =
      //IC_RELEASE: `https://dashboard.dfinity.network/api/datasources/proxy/2/api/v1/query_range?query=sum%20(avg%20by%20(ic_subnet)%20(artifact_pool_consensus_height_stat%7Bic%3D%22${Constants.IC_RELEASE}%22%2Cic_subnet%3D~%22.%2B%22%7D))&start=${Math.floor(startDate.getTime() / 1000)}&end=${Math.floor(endDate.getTime() / 1000)}&step=${secondsInMinute}`;
      `https://dashboard.dfinity.network/api/datasources/proxy/2/api/v1/query_range?query=sum%20(avg%20by%20(ic_subnet)%20(artifact_pool_consensus_height_stat%7Bic%3D~%22.%2B%22%2Cic_subnet%3D~%22.%2B%22%7D))&start=${Math.floor(startDate.getTime() / 1000)}&end=${Math.floor(endDate.getTime() / 1000)}&step=${secondsInMinute}`;
    axios.get(url)
      .then(res => {
        if (res.data.data.result.length && res.data.data.result[0].values.length >= 2) {
          const values = res.data.data.result[0].values;
          const firstValue = values[0];
          // Temporary workaround fix when using 10 minutes of minute data: Use second to last
          // value, since dashboard.dfinity.network seems to have a bug where the last value isn't
          // always reliable. Note >= 2 above as well, rather than >= 1.!!!
          const lastValue = values[values.length-2];
          const numBlocks = Math.max(Math.floor(lastValue[1] - firstValue[1]), 0);
          const seconds = Math.max(lastValue[0] - firstValue[0], 1);
          const blocksPerSecond = numBlocks / seconds;
          if (blocksPerSecond > 0) { // ignore glitchy data from API
            this.setState({
              blocksPerSecond: blocksPerSecond,
              error: 0
            });
          }
        }
      })
      .catch(() => {
        this.setState(prevState => ({
          error: prevState.error + 1
        }));
      });
  }*/
}

export default BlockTimeCard;
